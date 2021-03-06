/*
This file is part of the Juju GUI, which lets users view and manage Juju
environments within a graphical interface (https://launchpad.net/juju-gui).
Copyright (C) 2012-2013 Canonical Ltd.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License version 3, as published by
the Free Software Foundation.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranties of MERCHANTABILITY,
SATISFACTORY QUALITY, or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero
General Public License for more details.

You should have received a copy of the GNU Affero General Public License along
with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';


YUI.add('viewlet-charm-details', function(Y) {
  var browserViews = Y.namespace('juju.browser.views'),
      ns = Y.namespace('juju.viewlets'),
      templates = Y.namespace('juju.views').Templates,
      models = Y.namespace('juju.models');

  ns.charmDetails = {
    name: 'charmDetails',
    slot: 'left-hand-panel',
    templateWrapper: templates['left-breakout-panel'],
    /**
      When destroying the viewlet make sure we clean up our css.

      @method destroy
      @return {undefined} nothing.
     */
    destroy: function() {
      Y.one('.left-breakout').removeClass('with-charm');
      this.charmView.destroy();
    },
    /**
      Render the viewlet.

      @method render
      @param {Charm} charm An old charm model.
      @param {Object} viewletManagerAttrs This comes from the viewlet-manager
        object.
    */
    render: function(charm, viewletManagerAttrs) {
      var store = viewletManagerAttrs.store;
      store.charm(charm.get('storeId'), {
        'success': function(data, storeCharm) {
          this.charmView = new browserViews.BrowserCharmView({
            entity: storeCharm,
            forInspector: true,
            renderTo: this.container.one('.content'),
            store: store
          });
          this.charmView.render();
        },
        'failure': function(data) {
          this.charmView = new browserViews.BrowserCharmView({
            entity: charm,
            forInspector: true,
            renderTo: this.container.one('.content'),
            store: store
          });
          this.charmView.render();
        }
      }, this, viewletManagerAttrs.db.charms);
      return this.templateWrapper({ initial: 'Loading...'});
    }
  };
}, '0.0.1', {
  requires: [
    'node',
    'subapp-browser-charmview',
    'subapp-browser-bundleview',
    'juju-charm-models',
    'juju-view'
  ]
});
