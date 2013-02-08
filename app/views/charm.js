'use strict';

/**
 * Both of these views should probably either be deleted or converted to only
 * show environment charms.  My (GP) favorite option is to convert CharmView
 * into a service tab (viewing the environment's charm) and delete
 * CharmCollectionView.
 *
 * @module views
 * @submodule views.charm
 */

YUI.add('juju-view-charm-collection', function(Y) {

  var views = Y.namespace('juju.views'),
      Templates = views.Templates,
      utils = Y.namespace('juju.views.utils'),
      models = Y.namespace('juju.models');

  var CharmView = Y.Base.create('CharmView', Y.View, [], {
    initializer: function() {
      this.set('charm', null);
      console.log('Loading charm view', this.get('charm_data_url'));
      this.get('charm_store').get('datasource').sendRequest({
        request: this.get('charm_data_url'),
        callback: {
          'success': Y.bind(this.on_charm_data, this),
          'failure': function er(e) {
            console.error(e.error);
          }
        }
      });
    },

    template: Templates.charm,

    render: function() {
      var charm = this.get('charm'),
          container = this.get('container');
      CharmCollectionView.superclass.render.apply(this, arguments);
      if (!charm) {
        container.setHTML('<div class="alert">Loading...</div>');
        return;
      }
      // Convert time stamp TODO: should be in db layer
      var last_modified = charm.last_change.created;
      if (last_modified) {
        charm.last_change.created = new Date(last_modified * 1000);
      }

      var settings;
      if (charm.config) {
        settings = utils.extractServiceSettings(charm.config.options);
      }

      container.setHTML(this.template({
        charm: charm,
        settings: settings}));

      container.one('#charm-deploy').on(
          'click', Y.bind(this.on_charm_deploy, this));
      return this;
    },

    on_charm_data: function(io_request) {
      var charm = Y.JSON.parse(
          io_request.response.results[0].responseText);
      this.set('charm', charm);
      this.render();
    },

    on_charm_deploy: function(evt) {
      var charm = this.get('charm'),
          container = this.get('container'),
          charmUrl = charm.series + '/' + charm.name,
          env = this.get('env');
      // Generating charm url: see http://jujucharms.com/tools/store-missing
      // for examples of charm addresses.
      if (charm.owner !== 'charmers') {
        charmUrl = '~' + charm.owner + '/' + charmUrl;
      }
      charmUrl = 'cs:' + charmUrl;

      // Gather the configuration values from the form.
      var serviceName = container.one('#service-name').get('value'),
          config = utils.getElementsValuesMapping(container,
              '#service-config .config-field');

      // The deploy call generates an event chain leading to a call to
      // `app.on_database_changed()`, which re-dispatches the current view.
      // For this reason we need to redirect to the root page right now.
      this.fire('navigateTo', {url: '/'});
      env.deploy(charmUrl, serviceName, config,
          Y.bind(this._deployCallback, this)
      );
    },

    _deployCallback: function(ev) {
      if (ev.err) {
        this.get('db').notifications.add(
            new models.Notification({
              title: 'Error deploying charm',
              message: 'Service name: ' + ev.service_name +
                  '; Charm url: ' + ev.charm_url,
              level: 'error'
            })
        );
        return;
      }
      console.log(ev.charm_url + ' deployed');
    }
  });

  var CharmCollectionView = Y.Base.create('CharmCollectionView', Y.View, [], {

    initializer: function() {
      this.set('charms', []);
      this.set('current_request', null);
    },

    template: Templates['charm-collection'],

    render: function() {
      var container = this.get('container'),
          charm = this.get('charm'), // TODO change attribute name to "model"
          self = this;

      CharmCollectionView.superclass.render.apply(this, arguments);
      container.setHTML(this.template({charms: this.get('charms')}));

      // TODO: Use view.events structure to attach this
      container.all('div.thumbnail').each(function(el) {
        el.on('click', function(evt) {
          self.fire('navigateTo',
              {url: '/charms/' + this.getData('charm-url')});
        });
      });

      return this;
    },

    on_search_change: function(evt) {
      if (evt) {
        evt.preventDefault();
        evt.stopImmediatePropagation();
      }

      var query = Y.one('#charm-search').get('value');
      if (query) {
        this.set('query', query);
      } else {
        query = this.get('query');
      }

      // The handling in datasources-plugins is an example of doing this a bit
      // better ie. io cancellation outstanding requests, it does seem to
      // cause some interference with various datasource plugins though.
      this.get('charm_store').get('datasource').sendRequest({
        request: 'search/json?search_text=' + query,
        callback: {
          'success': Y.bind(this.on_results_change, this),
          'failure': function er(e) { console.error(e.error); }
        }});
    },

    on_results_change: function(io_request) {
      var result_set = Y.JSON.parse(
          io_request.response.results[0].responseText);
      this.set('charms', result_set.results);
      this.render();
    }

  });

  views.charm_collection = CharmCollectionView;
  views.charm = CharmView;

}, '0.1.0', {
  requires: [
    'node',
    'handlebars',
    'datasource-io',
    'datasource-jsonschema',
    'io-base',
    'json-parse',
    'view']
});
