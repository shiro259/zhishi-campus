'use strict';
/**
 * 图片上传云函数
 * 将前端传入的图片转存到 uniCloud 云存储，返回 fileID
 */
exports.main = async (event, context) => {
  const { fileContent, fileName } = event;

  if (!fileContent) {
    return { code: -1, message: '缺少图片数据' };
  }

  try {
    // fileContent 为 base64 字符串，需转为 Buffer
    const buffer = Buffer.from(fileContent, 'base64');
    const ext = (fileName || 'image.jpg').split('.').pop() || 'jpg';
    const cloudPath = `reviews/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    // 上传到云存储
    const uploadResult = await uniCloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: buffer
    });

    return {
      code: 0,
      message: '上传成功',
      data: {
        fileID: uploadResult.fileID,
        url: uploadResult.fileID
      }
    };
  } catch (e) {
    return { code: -1, message: '上传失败: ' + e.message };
  }
};
