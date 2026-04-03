const cloud = require('wx-server-sdk')
const tencentcloud = require("tencentcloud-sdk-nodejs-tts")

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const TtsClient = tencentcloud.tts.v20190823.Client;

exports.main = async (event, context) => {
  const { text } = event;

  if (!text) {
    return {
      code: -1,
      msg: '缺少要合成的文本内容哦'
    };
  }

  // 实例化一个认证对象，使用环境变量读取密钥，保证安全
  // 注意：我们需要在云开发控制台配置这两个环境变量
  const clientConfig = {
    credential: {
      secretId: process.env.ASR_CLOUD_SECRET_ID,
      secretKey: process.env.ASR_CLOUD_SECRET_KEY,
    },
    region: "ap-guangzhou", // 语音合成服务通常在广州或上海
    profile: {
      httpProfile: {
        endpoint: "tts.tencentcloudapi.com",
      },
    },
  };

  const client = new TtsClient(clientConfig);

  const params = {
    "Text": text,
    "SessionId": `session_${Date.now()}`,
    "Volume": 5, // 音量大小，范围：[0，10]，分别对应11个等级的音量，默认为0，代表正常音量
    "Speed": 0, // 语速，范围：[-2，2]，分别对应不同语速，默认为0
    "ProjectId": 0, // 项目id，默认为0
    "ModelType": 1, // 1：模型类型为1
    "VoiceType": 101016, // 音色：101016（女声，童音），非常适合给小朋友听！
    "PrimaryLanguage": 1, // 1: 中文
    "SampleRate": 16000, // 音频采样率
    "Codec": "mp3" // 音频格式
  };

  try {
    // 调用腾讯云 TTS 接口
    const data = await client.TextToVoice(params);
    
    // 返回合成的音频数据 (Base64)
    if (data.Audio) {
      return {
        code: 0,
        msg: '语音合成成功！',
        audioBase64: data.Audio
      };
    } else {
      return {
        code: -2,
        msg: '未能获取到音频数据'
      };
    }
  } catch (err) {
    console.error("腾讯云TTS调用失败：", err);
    return {
      code: -3,
      msg: '云端语音合成发生错误',
      error: err.message
    };
  }
}
