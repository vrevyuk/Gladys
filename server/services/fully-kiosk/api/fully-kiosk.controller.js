const asyncMiddleware = require('../../../api/middlewares/asyncMiddleware');

module.exports = function FullyKioskController(gladys, fullyKioskHandler) {
  /**
   * @api {post} /api/v1/service/fully-kiosk/tablet/test Test connection to a tablet.
   * @apiName testConnection
   * @apiGroup FullyKiosk
   */
  async function testConnection(req, res) {
    try {
      const info = await fullyKioskHandler.getDeviceInfo(req.body);
      res.json({
        success: true,
        deviceName: info.deviceName,
        batteryLevel: info.batteryLevel,
      });
    } catch (e) {
      res.json({ success: false, message: e.message });
    }
  }

  return {
    'post /api/v1/service/fully-kiosk/tablet/test': {
      authenticated: true,
      admin: true,
      controller: asyncMiddleware(testConnection),
    },
  };
};
