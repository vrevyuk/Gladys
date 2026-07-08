import { Text } from 'preact-i18n';
import EmptyState from './EmptyState';
import TabletBox from './TabletBox';

const DeviceTab = props => {
  const tablets = props.fullyKioskTablets || [];
  return (
    <div>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h3>
          <Text id="integration.fully-kiosk.deviceTab" />
        </h3>
        <button class="btn btn-primary" onClick={() => props.addTablet()}>
          <Text id="integration.fully-kiosk.addTablet" />
        </button>
      </div>
      {tablets.length === 0 && <EmptyState />}
      <div class="row">
        {tablets.map((tablet, index) => (
          <div class="col-md-6" key={tablet.id || tablet.selector}>
            <TabletBox
              tablet={tablet}
              tabletIndex={index}
              updateTabletField={props.updateTabletField}
              updateTabletParam={props.updateTabletParam}
              saveTablet={props.saveTablet}
              deleteTablet={props.deleteTablet}
              testConnection={props.testConnection}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default DeviceTab;
