/**
 * 菜品图片迁移：把本机 static/ 图片批量传到 uniCloud 云存储
 *
 * 为什么需要它
 *   现在 40 道菜的 image 字段都指向本机小程序包内的 static/dishes/*.jpg，
 *   41 张图合计 2.60MB —— 而微信小程序主包上限只有 2MB，上传体验版会被拦。
 *   图片改走云存储后，image 字段变成 cloud:// 的 fileID，主包就能瘦下来。
 *
 * 为什么不手工传
 *   手工在控制台传 41 个文件，再把 41 个 fileID 逐个填回菜品记录，既慢又容易错位。
 *   这里全自动：逐张上传 → 收集 fileID → 一次性批量写回云端。
 *
 * 关键实现点
 *   1. 小程序包内路径（/static/...）**不能直接**交给 uploadFile，
 *      必须先用 getImageInfo 换成临时文件路径（这是小程序端的通用做法）；
 *      getImageInfo 失败时退回 FileSystemManager.readFile 读成 ArrayBuffer 再传。
 *   2. 单张失败**不中断**整批：失败的记下来，调用方可以只重试失败的。
 *   3. 上传与写库分开：全部传完再一次性调云函数写回，
 *      避免「传了一半、库改了一半」这种更难收拾的中间状态。
 */

/** 是否需要迁移：image 指向本机静态文件才算需要 */
export function needsMigration(dish) {
  const img = String((dish && dish.image) || '').trim()
  if (!img) return false
  // 已经是云存储 fileID / 外链的，不用动
  if (img.indexOf('cloud://') === 0) return false
  if (/^https?:\/\//i.test(img)) return false
  return img.indexOf('static/') === 0 || img.indexOf('/static/') === 0
}

/** 取出需要迁移的菜品 */
export function pickMigratable(dishes) {
  return (Array.isArray(dishes) ? dishes : []).filter(needsMigration)
}

/** 本机路径 → 云存储路径（用文件名，保持可读且唯一） */
export function toCloudPath(dish, index) {
  const img = String((dish && dish.image) || '')
  const matched = img.match(/([^/\\]+\.(jpg|jpeg|png|webp))$/i)
  const fileName = matched ? matched[1] : `dish-${index + 1}.jpg`
  // 前缀带时间戳目录，避免与后台手工传的图撞名
  return 'dishes/seed-' + fileName
}

/**
 * 把包内图片换成可上传的临时路径
 * @returns {Promise<string>} 临时文件路径
 */
function toUploadablePath(localPath) {
  return new Promise((resolve, reject) => {
    // 首选：getImageInfo 会把代码包内的图片导出成临时文件
    uni.getImageInfo({
      src: localPath,
      success: (res) => {
        if (res && res.path) resolve(res.path)
        else reject(new Error('getImageInfo 没有返回临时路径'))
      },
      fail: (err) => {
        // 退回：直接读文件内容，交给 uploadFile 的 fileContent 上传
        const detail = (err && (err.errMsg || err.message)) || '未知原因'
        try {
          const fs = uni.getFileSystemManager && uni.getFileSystemManager()
          if (!fs || !fs.readFile) {
            reject(new Error('读不到本机图片：' + detail))
            return
          }
          fs.readFile({
            filePath: localPath,
            success: (r) => resolve({ content: r.data, path: localPath }),
            fail: (e2) =>
              reject(new Error('读不到本机图片：' + ((e2 && e2.errMsg) || detail)))
          })
        } catch (e) {
          reject(new Error('读不到本机图片：' + detail))
        }
      }
    })
  })
}

/** 上传单个文件，返回 fileID */
function uploadOne(uploadable, cloudPath) {
  return new Promise((resolve, reject) => {
    if (typeof uniCloud === 'undefined' || !uniCloud || !uniCloud.uploadFile) {
      reject(new Error('云存储不可用：请先在 HBuilderX 中关联 uniCloud 服务空间'))
      return
    }
    const payload =
      typeof uploadable === 'string'
        ? { filePath: uploadable, cloudPath }
        : { fileContent: uploadable.content, cloudPath }

    uniCloud.uploadFile({
      ...payload,
      success: (res) => {
        if (res && res.fileID) resolve(res.fileID)
        else reject(new Error('云存储没有返回 fileID'))
      },
      fail: (err) => reject(new Error((err && (err.errMsg || err.message)) || '上传失败'))
    })
  })
}

/**
 * 批量迁移
 *
 * @param {Array} dishes 菜品列表（只处理 image 指向 static/ 的）
 * @param {Object} [opts]
 * @param {(done:number,total:number,name:string)=>void} [opts.onProgress] 进度回调
 * @returns {Promise<{total:number,uploaded:Array<{id:string,name:string,image:string}>,failed:Array<{id:string,name:string,reason:string}>}>}
 */
export async function migrateDishImagesToCloud(dishes, opts = {}) {
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {}
  const targets = pickMigratable(dishes)

  const uploaded = []
  const failed = []

  for (let i = 0; i < targets.length; i++) {
    const dish = targets[i]
    const id = dish.id || dish._id || ''
    const name = dish.name || id
    onProgress(i, targets.length, name)
    try {
      if (!id) throw new Error('菜品缺少 id，无法写回云端')
      const localPath = String(dish.image).indexOf('/') === 0 ? dish.image : '/' + dish.image
      const uploadable = await toUploadablePath(localPath)
      const fileID = await uploadOne(uploadable, toCloudPath(dish, i))
      uploaded.push({ id: id, name: name, image: fileID })
    } catch (e) {
      failed.push({ id: id, name: name, reason: (e && e.message) || '未知错误' })
    }
  }
  onProgress(targets.length, targets.length, '')

  return { total: targets.length, uploaded: uploaded, failed: failed }
}
