import { Text } from 'preact-i18n';

const EmptyState = () => (
  <div class="text-center py-4">
    <h3>
      <Text id="integration.fully-kiosk.emptyTitle" />
    </h3>
    <p class="text-muted">
      <Text id="integration.fully-kiosk.emptyDescription" />
    </p>
  </div>
);

export default EmptyState;
