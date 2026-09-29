"""
AI 智能推荐服务
对接大模型 API，基于用户口味偏好、忌口、预算生成个性化菜品推荐
"""
import json
import random
from typing import List, Optional
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.config import settings
from app.models.dish import Dish
from app.schemas.recommend import RecommendRequest, RecommendItem, RecommendResponse
from app.services.auth_service import parse_list_field


class AIService:
    """AI 推荐服务"""

    def __init__(self):
        self.provider = settings.AI_PROVIDER
        self.api_key = settings.AI_API_KEY
        self.base_url = settings.AI_BASE_URL
        self.model = settings.AI_MODEL

    def _get_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def _build_prompt(self, user_pref: RecommendRequest, dish_candidates: List[dict]) -> str:
        """构建推荐 Prompt"""
        dishes_text = json.dumps(dish_candidates, ensure_ascii=False, indent=2)
        taste_str = "、".join(user_pref.taste) if user_pref.taste else "无特殊偏好"
        allergy_str = "、".join(user_pref.allergies) if user_pref.allergies else "无"
        budget_str = f"{user_pref.budget}元以内" if user_pref.budget else "不限"
        canteen_str = user_pref.canteen or "所有食堂"

        prompt = f"""你是「食遇校园」食堂AI推荐助手。请根据同学的口味偏好，从以下菜品中推荐3-5道最合适的菜品。

【同学需求】
- 用餐类型：{user_pref.meal_type}
- 口味偏好：{taste_str}
- 忌口（绝对不能出现）：{allergy_str}
- 预算：{budget_str}
- 食堂范围：{canteen_str}
- 额外要求：{user_pref.extra or '无'}

【可选菜品列表】（JSON格式，包含id/name/price/canteen/window/category/tags/rating/description）
{dishes_text}

【输出要求】
请严格输出 JSON 格式，不要输出任何额外文字：
{{
  "recommendations": [
    {{
      "dish_id": "菜品id",
      "reason": "简短诱人的推荐理由（30字以内，说明为什么推荐这道菜，结合口味/价格/评价）",
      "match_score": 90
    }}
  ],
  "summary": "一句话总结推荐方案（如：为你挑选了3道川味家常菜，性价比高且评价不错）"
}}

注意：
1. 必须从给定菜品列表中选择，dish_id 必须真实存在
2. 严禁推荐包含忌口食材的菜品
3. 价格不能超过预算
4. 推荐理由要结合菜品的口味、价格、评分等信息
5. match_score 为匹配度评分（0-100）
"""
        return prompt

    async def call_llm(self, prompt: str) -> Optional[str]:
        """调用大模型 API"""
        if not self.api_key:
            return None

        # 兼容不同厂商的端点
        url = f"{self.base_url.rstrip('/')}/chat/completions"

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "你是校园食堂美食推荐专家，擅长根据学生口味偏好推荐合适菜品。"},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "max_tokens": 1024
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(url, headers=self._get_headers(), json=payload)
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"[AI Service] LLM 调用失败: {e}")
            return None

    def _parse_llm_response(self, text: str) -> Optional[dict]:
        """解析 LLM 返回的 JSON"""
        if not text:
            return None
        # 去除可能的 markdown 代码块标记
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        try:
            return json.loads(text.strip())
        except json.JSONDecodeError:
            # 尝试提取 JSON 部分
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1:
                try:
                    return json.loads(text[start:end + 1])
                except json.JSONDecodeError:
                    return None
            return None

    def _fallback_recommend(self, user_pref: RecommendRequest,
                            candidates: List[dict]) -> RecommendResponse:
        """本地兜底推荐：当 LLM 不可用时使用规则引擎"""
        # 简单规则：按口味匹配 + 评分排序
        taste_set = set(user_pref.taste)
        allergy_set = set(user_pref.allergies)

        scored = []
        for d in candidates:
            tags = set(d.get("tags", []))
            # 忌口过滤
            if tags & allergy_set:
                continue
            # 口味匹配加分
            match_score = 60
            if taste_set & tags:
                match_score += 20
            match_score += min(d.get("rating", 0) * 4, 20)
            # 预算内加分
            if user_pref.budget and d["price"] <= user_pref.budget:
                match_score += 5
            scored.append((d, match_score))

        scored.sort(key=lambda x: x[1], reverse=True)
        top = scored[:min(5, len(scored))]

        recommendations = [
            RecommendItem(
                dish_id=d["id"],
                name=d["name"],
                canteen=d["canteen"],
                window=d["window"],
                price=d["price"],
                rating=d.get("rating", 0),
                image=d.get("image", ""),
                reason=f"{d['name']}，{d.get('category', '')}，评分{d.get('rating', 0):.1f}分，"
                       f"{'符合口味偏好' if taste_set & set(d.get('tags', [])) else '广受好评'}，值得一试！",
                match_score=min(score, 100)
            )
            for d, score in top
        ]

        return RecommendResponse(
            recommendations=recommendations,
            summary=f"根据你的口味偏好，为你精选了{len(recommendations)}道菜品，希望你喜欢！"
        )

    async def recommend(self, db: AsyncSession, user_pref: RecommendRequest) -> RecommendResponse:
        """主推荐流程"""
        # 1. 查询候选菜品
        query = select(Dish).where(Dish.status == 1)
        if user_pref.canteen:
            query = query.where(Dish.canteen == user_pref.canteen)
        if user_pref.budget:
            query = query.where(Dish.price <= user_pref.budget)

        result = await db.execute(query)
        dishes = result.scalars().all()

        if not dishes:
            return RecommendResponse(
                recommendations=[],
                summary="当前没有符合条件的菜品，试试调整预算或食堂范围吧~"
            )

        # 转换为字典
        dish_dicts = []
        for d in dishes:
            dish_dicts.append({
                "id": d.id,
                "name": d.name,
                "price": d.price,
                "canteen": d.canteen,
                "window": d.window,
                "category": d.category,
                "tags": parse_list_field(d.tags),
                "rating": d.rating,
                "description": d.description,
                "image": d.image
            })

        # 2. 构建 Prompt 并调用 LLM
        prompt = self._build_prompt(user_pref, dish_dicts)
        llm_text = await self.call_llm(prompt)
        llm_result = self._parse_llm_response(llm_text) if llm_text else None

        # 3. 处理结果
        if llm_result and "recommendations" in llm_result:
            dish_map = {d["id"]: d for d in dish_dicts}
            items = []
            for rec in llm_result["recommendations"]:
                dish_id = rec.get("dish_id")
                dish = dish_map.get(dish_id)
                if not dish:
                    continue
                # 更新推荐次数
                await db.execute(
                    Dish.__table__.update().where(Dish.id == dish_id)
                    .values(recommend_count=Dish.recommend_count + 1)
                )
                items.append(RecommendItem(
                    dish_id=dish_id,
                    name=dish["name"],
                    canteen=dish["canteen"],
                    window=dish["window"],
                    price=dish["price"],
                    rating=dish["rating"],
                    image=dish["image"],
                    reason=rec.get("reason", ""),
                    match_score=rec.get("match_score", 80)
                ))
            await db.commit()

            if items:
                return RecommendResponse(
                    recommendations=items,
                    summary=llm_result.get("summary", "为你精心挑选了以下菜品")
                )

        # 4. 兜底：使用本地规则推荐
        return self._fallback_recommend(user_pref, dish_dicts)


# 单例
ai_service = AIService()
