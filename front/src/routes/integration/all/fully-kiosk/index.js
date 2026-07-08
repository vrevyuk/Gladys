import { Component } from 'preact';
import { connect } from 'unistore/preact';
import actions from './actions';
import FullyKioskPage from './FullyKioskPage';
import DeviceTab from './DeviceTab';

class FullyKioskIntegration extends Component {
  componentWillMount() {
    this.props.getTablets();
  }

  render(props) {
    return (
      <FullyKioskPage user={props.user}>
        <DeviceTab {...props} />
      </FullyKioskPage>
    );
  }
}

export default connect('user,fullyKioskTablets,fullyKioskGetStatus', actions)(FullyKioskIntegration);
