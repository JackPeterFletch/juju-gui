'use strict';

/**
 * An in-memory fake Juju backend and supporting elements.
 *
 * @module env
 * @submodule env.fakebackend
 */

YUI.add('juju-env-fakebackend', function(Y) {

  var models = Y.namespace('juju.models');
  var UNAUTHENTICATEDERROR = {error: 'Please log in.'};
  /**
   * An in-memory fake Juju backend.
   *
   * @class FakeBackend
   */
  function FakeBackend(config) {
    // Invoke Base constructor, passing through arguments.
    FakeBackend.superclass.constructor.apply(this, arguments);
  }

  FakeBackend.NAME = 'fake-backend';
  FakeBackend.ATTRS = {
    authorizedUsers: {value: {'admin': 'password'}},
    authenticated: {value: false},
    charmStore: {}, // Required.
    defaultSeries: {value: 'precise'},
    providerType: {value: 'demonstration'}
  };

  Y.extend(FakeBackend, Y.Base, {

    /**
      Initializes.

      @method initializer
      @return {undefined} Nothing.
     */
    initializer: function() {
      this.db = new models.Database();
    },

    /**
      Attempt to log a user in.

      @method login
      @param {String} username The id of the user.
      @param {String} submittedPassword The user-submitted password.
      @return {Bool} True if the authentication was successful.
     */
    login: function(username, submittedPassword) {
      var password = this.get('authorizedUsers')[username],
          authenticated = password === submittedPassword;
      this.set('authenticated', authenticated);
      return authenticated;
    },

    /**
      Log out.  If already logged out, no error is raised.
     */
    logout: function() {
      this.set('authenticated', false);
    },

    /**
      Deploy a charm.  Uses a callback for response!

      @method deploy
      @param {String} charmUrl The URL of the charm.
      @param {Function} callback A call that will receive an object either
        with an "error" attribute containing a string describing the problem,
        or with a "service" attribute containing the new service, a "charm"
        attribute containing the charm used, and a "units" attribute
        containing a list of the added units.  This is asynchronous because we
        often must go over the network to the charm store.
      @param {Object} options An options object.
        name: The name of the service to be deployed, defaulting to the charm
          name.
        config: The charm configuration options, defaulting to none.
        unitCount: The number of units to be deployed.
      @return {undefined} Get the result from the callback.
     */
    deploy: function(charmId, callback, options) {
      if (!this.get('authenticated')) {
        return callback(UNAUTHENTICATEDERROR);
      }
      if (!options) {
        options = {};
      }
      var self = this;
      this._loadCharm(
          charmId,
          {
            /**
              Deploy the successfully-obtained charm.
             */
            success: function(charm) {
              self._deployFromCharm(charm, callback, options);
            },
            failure: callback
          }
      );
    },

    /**
      Get a charm from a URL, via charmStore and/or db.  Uses callbacks.

      @method _loadCharm
      @param {String} charmUrl The URL of the charm.
      @param {Function} callbacks An optional object with optional success and
        failure callables.  This is asynchronous because we
        often must go over the network to the charm store.  The success
        callable receives the fully loaded charm, and the failure callable
        receives an object with an explanatory "error" attribute.
      @return {undefined} Use the callbacks to handle success or failure.
     */
    _loadCharm: function(charmId, callbacks) {
      var charmIdParts = models.parseCharmId(
          charmId, this.get('defaultSeries'));
      if (!callbacks) {
        callbacks = {};
      }
      if (!charmIdParts) {
        return (
            callbacks.failure &&
            callbacks.failure({error: 'Invalid charm id.'}));
      }
      var charm = this.db.charms.getById(charmId);
      if (charm) {
        callbacks.success(charm);
      } else {
        // Get the charm data.
        var self = this;
        this.get('charmStore').loadByPath(
            charmIdParts.charm_store_path,
            {
              /**
                Convert the charm data to a charm and use the success callback.
               */
              success: function(data) {
                var charm = self._getCharmFromData(data);
                if (callbacks.success) {
                  callbacks.success(charm);
                }
              },
              /**
                Inform the caller of an error using the charm store.
               */
              failure: function(e) {
                if (callbacks.failure) {
                  callbacks.failure({error: 'Could not contact charm store.'});
                }
              }
            }
        );
      }

    },

    /**
      Convert charm data as returned by the charmStore into a charm.
      The charm might be pre-existing or might need to be created, but
      after this method it will be within the db.

      @method _getCharmFromData
      @param {Object} data The raw charm information as delivered by the
        charmStore's loadByPath method.
      @return {Object} A matching charm from the db.
     */
    _getCharmFromData: function(data) {
      var charm = this.db.charms.getById(data.store_url);
      if (!charm) {
        delete data.store_revision;
        delete data.bzr_branch;
        delete data.last_change;
        data.id = data.store_url;
        charm = this.db.charms.add(data);
      }
      return charm;
    },

    /**
      Deploy a charm, given the charm, a callback, and options.

      @param {Object} charm The charm to be deployed, from the db.
      @param {Function} callback A call that will receive an object either
        with an "error" attribute containing a string describing the problem,
        or with a "service" attribute containing the new service, a "charm"
        attribute containing the charm used, and a "units" attribute
        containing a list of the added units.  This is asynchronous because we
        often must go over the network to the charm store.
      @param {Object} options An options object.
        name: The name of the service to be deployed, defaulting to the charm
          name.
        config: The charm configuration options, defaulting to none.
        unitCount: The number of units to be deployed.
      @return {undefined} Get the result from the callback.
     */
    _deployFromCharm: function(charm, callback, options) {
      if (!options.name) {
        options.name = charm.get('package_name');
      }
      if (this.db.services.getById(options.name)) {
        return callback({error: 'A service with this name already exists.'});
      }
      var service = this.db.services.add({
        id: options.name,
        name: options.name,
        charm: charm.get('id'),
        exposed: false,
        subordinate: charm.get('is_subordinate'),
        config: options.config
      });
      var response = this.addUnit(options.name, options.unitCount);
      response.service = service;
      callback(response);
    },

    // destroyService: function() {

    // },

    // getService: function() {

    // },

    // getCharm: function() {

    // },

    /**
      Add units to the given service.

      @method addUnit
      @param {String} serviceName The name of the service to be scaled up.
      @param {Integer} numUnits The number of units to be added, defaulting
        to 1.
      @return {Object} Returns an object either with an "error" attribute
        containing a string describing the problem, or with a "units"
        attribute containing a list of the added units.
     */
    addUnit: function(serviceName, numUnits) {
      if (!this.get('authenticated')) {
        return UNAUTHENTICATEDERROR;
      }
      if (Y.Lang.isUndefined(numUnits)) {
        numUnits = 1;
      }
      if (!Y.Lang.isNumber(numUnits) || numUnits < 1) {
        return {error: 'Invalid number of units.'};
      }
      var service = this.db.services.getById(serviceName);
      if (!service) {
        return {error: 'Service "' + serviceName + '" does not exist.'};
      }
      if (!service.unitSequence) {
        service.unitSequence = 0;
      }
      var result = [];
      // var unitMachines = this._getUnitMachines(numUnits);

      for (var i = 0; i < numUnits; i += 1) {
        var unitId = service.unitSequence += 1;
        result.push(
            this.db.units.add({
              'id': serviceName + '/' + unitId,
              //'machine': unit_machines.shift(),
              // The models use underlines, not hyphens (see
              // app/models/models.js in _process_delta.)
              'agent_state': 'started'
            })
        );
      }
      return {units: result};
    } // ,

    // removeUnit: function() {

    // },

    // getEndpoints: function() {

    // },

    // updateAnnotations: function() {

    // },

    // getAnnotations: function() {

    // },

    // removeAnnotations: function() {

    // },

    // addRelation: function() {

    // },

    // removeRelation: function() {

    // },

    // expose: function() {

    // },

    // unexpose: function() {

    // },

    // setConfig: function() {

    // },

    // setConstraints: function() {

    // },

    // resolved: function() {

    // }

  });

  Y.namespace('juju.environments').FakeBackend = FakeBackend;

}, '0.1.0', {
  requires: [
    'base',
    'juju-models'
  ]
});