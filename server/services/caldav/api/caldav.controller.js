const asyncMiddleware = require('../../../api/middlewares/asyncMiddleware');

module.exports = function CalDAVController(caldavHandler) {
  /**
   * @api {get} /api/v1/service/caldav/config Check config
   * @apiName Config
   * @apiGroup CalDAV
   */
  async function config(req, res) {
    await caldavHandler.config(req.user.id);
    await caldavHandler.cleanUp(req.user.id);
    res.json({
      success: true,
    });
  }

  /**
   * @api {get} /api/v1/service/caldav/cleanup Clear users CalDAV's calendars
   * @apiName CleanUp
   * @apiGroup CalDAV
   */
  async function cleanup(req, res) {
    await caldavHandler.cleanUp(req.user.id);
    res.json({
      success: true,
    });
  }

  /**
   * @api {get} /api/v1/service/caldav/sync Start caldav sync for a user
   * @apiName Sync
   * @apiGroup CalDAV
   */
  async function sync(req, res) {
    const caldavUrl = await caldavHandler.gladys.variable.getValue('CALDAV_URL', caldavHandler.serviceId, req.user.id);
    if (caldavUrl) {
      await caldavHandler.syncUserCalendars(req.user.id);
    }
    await caldavHandler.syncUserWebcals(req.user.id);
    res.json({
      success: true,
    });
  }

  /**
   * @api {post} /api/v1/service/caldav/webcal Subscribe to an ICS/Webcal URL
   * @apiName AddWebcal
   * @apiGroup CalDAV
   */
  async function addWebcal(req, res) {
    const calendar = await caldavHandler.addWebcal(req.user.id, req.body.url);
    res.status(201).json(calendar);
  }

  /**
   * @api {delete} /api/v1/service/caldav/calendar/:selector Delete a calendar
   * @apiName DestroyCalendar
   * @apiGroup CalDAV
   */
  async function destroyCalendar(req, res) {
    await caldavHandler.destroyCalendar(req.user.id, req.params.selector);
    res.json({
      success: true,
    });
  }

  /**
   * @api {patch} /api/v1/service/caldav/enable Enable calendar synchronization
   * @apiName Enable
   * @apiGroup CalDAV
   */
  async function enable(req, res) {
    const calendar = await caldavHandler.enableCalendar(req.body.selector, req.body.sync);
    res.status(200).json(calendar);
  }

  /**
   * @api {patch} /api/v1/service/caldav/disable Disable calendar synchronization
   * @apiName Disable
   * @apiGroup CalDAV
   */
  async function disable(req, res) {
    const calendar = await caldavHandler.disableCalendar(req.body.selector, req.body.sync);
    res.status(200).json(calendar);
  }

  return {
    'get /api/v1/service/caldav/config': {
      authenticated: true,
      controller: asyncMiddleware(config),
    },
    'get /api/v1/service/caldav/cleanup': {
      authenticated: true,
      controller: asyncMiddleware(cleanup),
    },
    'get /api/v1/service/caldav/sync': {
      authenticated: true,
      controller: asyncMiddleware(sync),
    },
    'patch /api/v1/service/caldav/enable': {
      authenticated: true,
      controller: asyncMiddleware(enable),
    },
    'patch /api/v1/service/caldav/disable': {
      authenticated: true,
      controller: asyncMiddleware(disable),
    },
    'post /api/v1/service/caldav/webcal': {
      authenticated: true,
      controller: asyncMiddleware(addWebcal),
    },
    'delete /api/v1/service/caldav/calendar/:selector': {
      authenticated: true,
      controller: asyncMiddleware(destroyCalendar),
    },
  };
};
