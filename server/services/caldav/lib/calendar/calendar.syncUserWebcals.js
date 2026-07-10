const Promise = require('bluebird');
const logger = require('../../../../utils/logger');

/**
 * @description Start user's WEBCAL calendars synchronization.
 * @param {object} userId - Gladys user to synchronize.
 * @returns {Promise} Resolving.
 * @example
 * syncUserWebcals(user.id)
 */
async function syncUserWebcals(userId) {
  // List user Webcals
  const gladysWebcals = await this.gladys.calendar.get(userId, { sync: true, type: 'WEBCAL' });

  logger.info(`Webcal : Found ${gladysWebcals.length} calendars.`);

  await Promise.map(
    gladysWebcals,
    async (gladysWebcal) => {
      const { data: icalEvents } = await this.gladys.http.request('get', gladysWebcal.external_id, null);
      const now = this.dayjs();
      const jsonEvents = Object.values(this.ical.parseICS(icalEvents));

      const formatedEvents = this.formatEvents(jsonEvents, gladysWebcal);
      const existingEvents = await this.gladys.calendar.getEvents(userId, { calendarId: gladysWebcal.id });

      let insertedOrUpdatedEvent = 0;

      await Promise.map(
        formatedEvents,
        async (formatedEvent) => {
          // Match on external_id: it is stored verbatim, whereas the stored
          // selector is slugified on creation and cannot be compared reliably.
          const existingIndex = existingEvents.findIndex(
            (existing) => existing.external_id === formatedEvent.external_id,
          );

          try {
            // Create event if it does not already exist in database
            if (existingIndex === -1) {
              await this.gladys.calendar.createEvent(gladysWebcal.selector, formatedEvent);
              insertedOrUpdatedEvent += 1;
            } else {
              // Else update existing event
              const rowEvent = jsonEvents.find(
                (jsonEvent) => jsonEvent.uid === formatedEvent.external_id.replace(/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}/, ''),
              );
              // Some feeds (e.g. Proton) have no LAST-MODIFIED: fall back to DTSTAMP,
              // and skip the update when neither is present instead of treating the
              // event as always modified (dayjs(undefined) is "now").
              const lastModified = rowEvent ? rowEvent.lastmodified || rowEvent.dtstamp : undefined;
              if (lastModified && this.dayjs(gladysWebcal.last_sync).isBefore(this.dayjs(lastModified))) {
                // Never rewrite identity fields on update: the selector is stored
                // slugified and updates bypass the slugify hook, so writing the raw
                // selector back would corrupt the row identity.
                const { selector, external_id: externalId, ...eventUpdate } = formatedEvent;
                await this.gladys.calendar.updateEvent(existingEvents[existingIndex].selector, eventUpdate);
                insertedOrUpdatedEvent += 1;
              }
              // Remove it from eventToDelete list
              existingEvents.splice(existingIndex, 1);
            }
          } catch (e) {
            logger.error(e);
          }
        },
        { concurrency: 1 },
      );
      logger.info(`Webcal : ${insertedOrUpdatedEvent} events updated for calendar ${gladysWebcal.name}.`);

      await Promise.map(existingEvents, (eventToDelete) => this.gladys.calendar.destroyEvent(eventToDelete.selector), {
        concurrency: 2,
      });
      logger.info(`Webcal : ${existingEvents.length} events deleted for calendar ${gladysWebcal.name}.`);

      await this.gladys.calendar.update(gladysWebcal.selector, { last_sync: now.format() });
    },
    { concurrency: 1 },
  );
}

module.exports = {
  syncUserWebcals,
};
