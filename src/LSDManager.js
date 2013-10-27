/*
  #        #####  ######  #     #
  #       #     # #     # ##   ##   ##   #    #   ##    ####  ###### #####
  #       #       #     # # # # #  #  #  ##   #  #  #  #    # #      #    #
  #        #####  #     # #  #  # #    # # #  # #    # #      #####  #    #
  #             # #     # #     # ###### #  # # ###### #  ### #      #####
  #       #     # #     # #     # #    # #   ## #    # #    # #      #   #
  #######  #####  ######  #     # #    # #    # #    #  ####  ###### #    #
*/

function LSDManager(injectStorage) {
    this.lastId            = 0;
    this.entityDefinitions = {};
    this.entityClasses     = {};
    this.eventId           = 0;
    this.events            = {};
    this.repositories      = {};
    this.repositoryClasses = {};

    if (injectStorage) {
        this.storage = injectStorage;
    } else {
        this.storage = new Storage('lsd');
    }

    this.checkType = function(variable, type) {
        return this.getType(variable) === type;
    };

    this.extend = function(parent, child) {
        for (var i in child) {
            parent[i] = child[i];
        }

        return parent;
    };

    this.fireEvents = function(eventName, repository, data) {
        if (this.events[eventName] !== undefined) {
            console.group(
                'Call %d callback(s) for event %s',
                this.events[eventName].length,
                eventName
            );

            for (var i in this.events[eventName]) {
                if (i !== 'length') {
                    this.events[eventName][i](repository, data);
                }
            }

            console.groupEnd();
        }

        return this;
    };

    this.fixValueType = function(value, type) {
        if (type === undefined) {
            value = null;
        } else if (!this.checkType(value, type)) {
            var tmp, i;
            var valueType = this.getType(value);

            switch (type) {
                case 'array':
                    if (valueType === 'object') {
                        tmp = [];

                        for (i in value) {
                            tmp.push(value[i]);
                        }

                        value = tmp;
                    } else {
                        value = [ value ];
                    }
                break;

                case 'boolean':
                    if (value === 'false' || valueType === 'array' && value.length === 0 || valueType === 'object' && Object.keys(value).length === 0) {
                        value = false;
                    } else {
                        value = !!value;
                    }
                break;

                case 'float':
                case 'integer':
                    if (valueType === 'boolean') {
                        if (value) {
                            value = 1;
                        } else {
                            value = 0;
                        }
                    } else if (valueType === 'number' && type === 'integer') {
                        value = Math.round(value);
                    } else if (valueType === 'array') {
                        value = value.length;
                    } else {
                        if (type === 'integer') {
                            value = parseInt(value, 10);
                        } else {
                            value = parseFloat(value);
                        }

                        if (!value) {
                            value = 0;
                        }
                    }
                break;

                case 'object':
                    if (valueType === 'array') {
                        tmp = {};

                        for (i in value) {
                            tmp[i] = value[i];
                        }

                        value = tmp;
                    } else {
                        value = {
                            0: value
                        };
                    }
                break;

                case 'string':
                    if (valueType === 'array' || valueType === 'object') {
                        value = JSON.stringify(value);
                    } else {
                        value = '' + value;
                    }
                break;
            }
        }

        return value;
    };

    this.getDataPrefix = function() {
        return this.storage.prefix;
    };

    this.getEntityClass = function(entityName) {
        if (this.entityClasses[entityName]) {
            return this.entityClasses[entityName];
        } else {
            return {};
        }
    };

    this.getEntityDefinition = function(entityName) {
        if (this.entityDefinitions[entityName]) {
            return this.entityDefinitions[entityName];
        } else {
            return {};
        }
    };

    this.getMethodName = function(prefix, field, suffix) {
        if (!suffix) {
            suffix = '';
        }

        return prefix + field.substring(0, 1).toUpperCase() + field.substring(1) + suffix;
    };

    this.getNewId = function(entity) {
        var id;

        do {
            id = '$$id' + new Date().getTime();
        } while (id === this.lastId);

        this.lastId = id;

        return id;
    };

    this.getRepository = function(entityName) {
        if (!this.isValidEntity(entityName)) {
            throw new Error('Unknown repository for ' + entityName);
        } else {
            if (!this.repositories[entityName]) {
                this.repositories[entityName] = this.extend(
                    new Repository(this, entityName),
                    this.getRepositoryClass(entityName)
                );

                this.repositories[entityName].init();
            }

            return this.repositories[entityName];
        }
    };

    this.getRepositoryClass = function(entityName) {
        if (this.repositoryClasses[entityName]) {
            return this.repositoryClasses[entityName];
        } else {
            return {};
        }
    };

    this.getType = function(o) {
        var TOSTRING = Object.prototype.toString;
        var TYPES    = {
            'undefined'        : 'undefined',
            'number'           : 'number',
            'boolean'          : 'boolean',
            'string'           : 'string',
            '[object Function]': 'function',
            '[object Array]'   : 'array'
        };

        var type;

        if ((type = TYPES[typeof o]) !== undefined) {
            return type;
        } else if ((type = TYPES[TOSTRING.call(o)]) !== undefined) {
            return type;
        } else if (o) {
            return 'object';
        } else {
            return 'null';
        }
    };

    this.isValidEntity = function(entityName) {
        if (this.checkType(this.entityDefinitions[entityName], 'object')) {
            return true;
        }

        if (this.checkType(this.entityClasses[entityName],     'object')) {
            return true;
        }

        if (this.checkType(this.repositoryClasses[entityName], 'object')) {
            return true;
        }

        return false;
    };

    this.registerEvent = function(eventName, callback) {
        if (this.events[eventName] === undefined) {
            this.events[eventName] = { length: 0 };
        }

        this.events[eventName][this.eventId] = callback;
        this.events[eventName].length++;

        return this.eventId++;
    };

    this.setDataPrefix = function(prefix) {
        this.storage.prefix = prefix;

        return this;
    };

    this.setEntityClass = function(entityName, entityClass) {
        this.entityClasses[entityName] = entityClass;

        return this;
    };

    this.setEntityDefinition = function(entityName, entityDefinition) {
        if (entityDefinition.fields === undefined) {
            entityDefinition.fields = {};
        }

        if (entityDefinition.fields.id === undefined) {
            entityDefinition.fields.id = {};
        }

        if (entityDefinition.relations === undefined) {
            entityDefinition.relations = {};
        }

        this.entityDefinitions[entityName] = entityDefinition;

        return this;
    };

    this.setRepositoryClass = function(entityName, repositoryClass) {
        this.repositoryClasses[entityName] = repositoryClass;

        return this;
    };

    this.unregisterEvent = function(eventName, eventId) {
        if (this.events[eventName] && this.events[eventName][eventId]) {
            delete this.events[eventName][eventId];
            this.events[eventName].length--;

            if (this.events[eventName].length === 0) {
                delete this.events[eventName];
            }
        }

        return this;
    };
}


/*
   #####
  #     # #####  ####  #####    ##    ####  ######
  #         #   #    # #    #  #  #  #    # #
   #####    #   #    # #    # #    # #      #####
        #   #   #    # #####  ###### #  ### #
  #     #   #   #    # #   #  #    # #    # #
   #####    #    ####  #    # #    #  ####  ######
*/

function Storage(prefix) {
    if (prefix) {
        this.prefix = prefix;
    } else {
        this.prefix = 'storage';
    }

    this.separator = '.';

    this.get = function(key, defaultValue) {
        value = JSON.parse(
            localStorage.getItem(
                this.key(
                    [ this.prefix, key ]
                )
            )
        );

        if (!value) {
            if (defaultValue) {
                value = defaultValue;
            } else {
                value = null;
            }
        }

        return value;
    };

    this.has = function(key) {
        return this.get(key) !== null;
    };

    this.key = function(parts) {
        return parts.join(this.separator);
    };

    this.set = function(key, value) {
        localStorage.setItem(
            this.key(
                [ this.prefix, key ]
            ),
            JSON.stringify(value)
        );
    };

    this.unset = function(key) {
        localStorage.removeItem(
            this.key(
                [ this.prefix, key ]
            )
        );
    };
}


/*
  ######
  #     # ###### #####   ####   ####  # #####  ####  #####  #   #
  #     # #      #    # #    # #      #   #   #    # #    #  # #
  ######  #####  #    # #    #  ####  #   #   #    # #    #   #
  #   #   #      #####  #    #      # #   #   #    # #####    #
  #    #  #      #      #    # #    # #   #   #    # #   #    #
  #     # ###### #       ####   ####  #   #    ####  #    #   #
*/
function Repository(manager, entityName) {
    this.manager    = manager;
    this.entityName = entityName;

    this.createEntity = this._createEntity = function(data) {
        if (!data) {
            data = {};
        }

        var entity = this.manager.extend(
            new Entity(this),
            this.manager.getEntityClass(entityName)
        );

        for (var field in this.getEntityDefinition().fields) {
            var methodGet = this.manager.getMethodName('get', field);

            if (entity[methodGet] === undefined) {
                entity[methodGet] = eval(
                    'f = function() {' +
                        'return this.get("' + field + '");' +
                    '}'
                );
            }

            var methodSet = this.manager.getMethodName('set', field);

            if (entity[methodSet] === undefined) {
                entity[methodSet] = eval(
                    'f = function(value) {' +
                        'return this.set("' + field + '", value);' +
                    '}'
                );
            }
        }

        entity.init();

        return this.loadEntity(
            entity,
            data
        );
    };

    this.findAll = this._findAll = function() {
        return this.query(
            function() {
                return true;
            }
        );
    };

    this.findBy = this._findBy = function(field, value) {
        return this.query(
            function(entity) {
                return entity[field] == value;
            }
        );
    };

    this.findOneBy = this._findOneBy = function(field, value) {
        var entities = this.findBy(field, value);

        if (entities.length > 0) {
            return entities[0];
        } else {
            return null;
        }
    };

    this.findEntity = this._findEntity = function(id, entityName) {
        if (!entityName) {
            entityName = this.entityName;
        }

        var entityKey = this.manager.storage.key( [ entityName, id ] );

        if (!this.manager.storage.has(entityKey)) {
            throw new Error('Unknown entity ' + this.entityName + ' with storage key ' + entityKey);
        }

        var entity = this.createEntity(
            this.manager.storage.get(entityKey)
        );

        entity.__oldId = entity.id;

        return entity;
    };

    this.getEntityDefinition = this._getEntityDefinition = function() {
        return this.manager.getEntityDefinition(this.entityName);
    };

    this.getEntityStorageData = this._getEntityStorageData = function(entity) {
        var data = {};

        for (var field in this.getEntityDefinition().fields) {
            var storageMethod = this.manager.getMethodName('get', field, 'ForStorage');

            if (this.manager.checkType(entity[storageMethod], 'function')) {
                data[field] = entity[storageMethod]();
            } else {
                data[field] = entity[this.manager.getMethodName('get', field)]();
            }
        }

        return data;
    };

    this.getIdsStorageKey = this._getIdsStorageKey = function() {
        return this.manager.storage.key(
            [ this.entityName, '$$ids' ]
        );
    };

    this.getIdsStorage = this._getIdsStorage = function() {
        return this.manager.storage.get(
            this.getIdsStorageKey(),
            []
        );
    };

    this.init = function() {};

    this.loadEntity = this._loadEntity = function(entity, data) {
        for (var field in data) {
            var methodStorage = this.manager.getMethodName('set', field, 'FromStorage');
            var methodSet     = this.manager.getMethodName('set', field);

            if (this.manager.checkType(entity[methodStorage], 'function')) {
                entity[methodStorage](data[field]);
            } else if (this.manager.checkType(entity[methodSet], 'function')) {
                entity[methodSet](data[field]);
            }
        }

        return entity;
    },

    this.query = this._query = function(filter) {
        var entitiesId = this.getIdsStorage();
        var entities   = [];

        for (var i in entitiesId) {
            var entity = this.findEntity(entitiesId[i]);

            if (filter === undefined || filter(entity)) {
                entities.push(entity);
            }
        }

        return entities;
    };

    this.remove = this._remove = function(id, fireEvents) {
        if (fireEvents === undefined) {
            fireEvents = true;
        }

        console.group(
            'Deleting %s #%s',
            this.entityName,
            id
        );

        var entitiesId = this.getIdsStorage();
        var indexOf    = entitiesId.indexOf(id);
        if (indexOf === -1) {
            console.log('Nothing to delete');
        } else {
            entitiesId.splice(entitiesId.indexOf(id), 1);
            this.setIdsStorage(entitiesId);

            this.manager.storage.unset(
                this.manager.storage.key(
                    [ this.entityName, id ]
                )
            );

            if (fireEvents) {
                this.manager.fireEvents('afterRemove', this, id);
            }

            console.log(
                '%s #%s deleted',
                this.entityName,
                id
            );
        }

        console.groupEnd();

        return this;
    };

    this.removeCollection = this._removeCollection = function(collection, fireEvents) {
        console.group('Remove collection');

        for (var i = 0; i < collection.length; i++) {
            this.remove(collection[i], fireEvents);
        }

        console.groupEnd();

        return this;
    };

    this.save = this._save = function(entity, fireEvents) {
        if (entity.getId() === undefined) {
            entity.setId(this.manager.getNewId());
        }

        if (fireEvents === undefined) {
            fireEvents = true;
        }

        console.group(
            'Saving %s #%s',
            this.entityName,
            entity.getId()
        );

        if (entity.getId() !== entity.__oldId && entity.__oldId !== null) {
            this.remove(entity.__oldId, fireEvents);
        }

        var entitiesId = this.getIdsStorage();
        if (entitiesId.indexOf(entity.getId()) == -1) {
            entitiesId.push(entity.getId());
            this.setIdsStorage(entitiesId);
        }

        this.manager.storage.set(
            this.manager.storage.key(
                [ this.entityName, entity.getId() ]
            ),
            this.getEntityStorageData(entity)
        );

        entity.__oldId = entity.getId();

        if (fireEvents) {
            this.manager.fireEvents('afterSave', this, entity);
        }

        console.groupEnd();
        console.log(
            '%s #%s saved',
            this.entityName,
            entity.getId()
        );
    };

    this.saveCollection = this._saveCollection = function(collection, fireEvents) {
        console.group('Save collection');

        for (var i = 0; i < collection.length; i++) {
            this.save(collection[i], fireEvents);
        }

        console.groupEnd();

        return this;
    };

    this.setIdsStorage = this._setIdsStorage = function(entitiesId) {
        this.manager.storage.set(this.getIdsStorageKey(), entitiesId);
    };
}


/*
  #######
  #       #    # ##### # ##### #   #
  #       ##   #   #   #   #    # #
  #####   # #  #   #   #   #     #
  #       #  # #   #   #   #     #
  #       #   ##   #   #   #     #
  ####### #    #   #   #   #     #
*/

function Entity(repository) {
    this.repository = repository;

    this.__oldId = null;

    this.get = this._get = function(field) {
        return this.repository.manager.fixValueType(
            this[field],
            this.repository.getEntityDefinition().fields[field]
        );
    };

    this.init = function() {};

    this.set = this._set = function(field, value) {
        this[field] = this.repository.manager.fixValueType(
            value,
            this.repository.getEntityDefinition().fields[field]
        );

        return this;
    };
}