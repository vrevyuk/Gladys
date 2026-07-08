import { Text } from 'preact-i18n';
import cx from 'classnames';

const FullyKioskPage = ({ children, user }) => (
  <div class="page">
    <div class="page-main">
      <div class="my-3 my-md-5">
        <div class="container">
          <div class="page-header">
            <h1 class="page-title">
              <Text id="integration.fully-kiosk.title" />
            </h1>
          </div>
          <div class="row">
            <div class="col-lg-12">
              <div class="card">
                <div class={cx('card-body')}>{children}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default FullyKioskPage;
