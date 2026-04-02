App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      // 初始化云开发环境
      wx.cloud.init({
        env: '',
        traceUser: true,
      })
    }
  }
})