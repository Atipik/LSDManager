function LSDManager(injectStorage, injectConsole) {
    this.eventId          = 0;
    this.events           = {};
    this.entitiesMetadata = {};

    if (injectStorage) {
        this.storage = injectStorage;
    } else {
        this.storage = new Storage('lsd');
    }

    if (injectConsole) {
        this.console = injectConsole;
    } else {
        this.console = console;
    }

    this.extend = function(parent, child) {
        for (var i in child) {
            parent[i] = child[i];
        }

        return parent;
    };

    this.fireEvents = function(eventName, repository, data) {
        if (this.events[eventName] !== undefined) {
            this.console.group(
                'Call %d callback(s) for event %s',
                this.events[eventName].length,
                eventName
            );

            for (var i in this.events[eventName]) {
                if (i !== 'length') {
                    this.events[eventName][i](repository, data);
                }
            }

            this.console.groupEnd();
        }
    };

    this.fixValueType = function(value, type) {
        if (type === undefined) {
            value = null;
        } else if (this.getType(value) !== type) {
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

    this.getRepository = function(entityName) {
        if (this.entitiesMetadata[entityName] === undefined) {
            throw new Error('Unknown repository for ' + entityName);
        } else {
            var metadata = this.entitiesMetadata[entityName];

            var repository = new Repository(
                this,
                entityName,
                metadata
            );

            var repositoryMethods = {};

            if (metadata.methods && metadata.methods.repository) {
                repositoryMethods = metadata.methods.repository;
            }

            return this.extend(
                repository,
                repositoryMethods
            );
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
    };

    this.setEntity = function(name, metadata) {
        this.entitiesMetadata[name] = metadata;
    };

    this.unregisterEvent = function(eventName, eventId) {
        if (this.events[eventName] && this.events[eventName][eventId]) {
            delete this.events[eventName][eventId];
            this.events[eventName].length--;

            if (this.events[eventName].length === 0) {
                delete this.events[eventName];
            }
        }
    };
}

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

function Repository(manager, entityName, metadata) {
    this.manager        = manager;
    this.entityName = entityName;
    this.metadata   = metadata;

    this.nextId = 1;

    this.createEntity = this._createEntity = function(data) {
        if (!data) {
            data = {};
        }

        return this.loadEntity(
            new Entity(this),
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

    this.getEntity = this._getEntity = function(storageKey) {
        var entityKey = this.manager.storage.key(storageKey);

        if (!this.manager.storage.has(entityKey)) {
            throw new Error('Unknown entity ' + this.getEntityName() + ' with storageKey ' + storageKey);
        }

        var entity = this.createEntity(
            this.manager.storage.get(entityKey)
        );

        entity._oldId = entity.id;

        return entity;
    };

    this.getEntityData = this._getEntityData = function(entity) {
        var data = {};

        for (var field in this.metadata.fields) {
            data[field] = entity[this.getMethodName('get', field)]();
        }

        return data;
    };

    this.getEntityName = this._getEntityName = function() {
        return this.entityName;
    };

    this.getIdsStorageKey = this._getIdsStorageKey = function() {
        return this.manager.storage.key(
            [ this.getEntityName(), '_' ]
        );
    };

    this.getIdsStorage = this._getIdsStorage = function() {
        return this.manager.storage.get(
            this.getIdsStorageKey(),
            []
        );
    };

    this.getMethodName = this._getMethodName = function(prefix, field) {
        return prefix + field.substring(0, 1).toUpperCase() + field.substring(1);
    };

    this.getNewId = this._getNewId = function(entity) {
        return 'id' + new Date().getTime();
    };

    this.loadEntity = this._loadEntity = function(entity, data) {
        for (var field in data) {
            var methodName = this.getMethodName('set', field);

            if (typeof entity[methodName] == 'function') {
                entity[methodName](data[field]);
            }
        }

        return entity;
    },

    this.query = this._query = function(filter) {
        var entitiesId = this.getIdsStorage();
        var entities   = [];

        for (var i in entitiesId) {
            var entity = this.getEntity(
                [ this.getEntityName(), entitiesId[i] ]
            );

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

        this.console.group(
            'Deleting %s #%s',
            this.getEntityName(),
            id
        );

        var entitiesId = this.getIdsStorage();
        var indexOf    = entitiesId.indexOf(id);
        if (indexOf === -1) {
            this.console.log('Nothing to delete');
        } else {
            entitiesId.splice(entitiesId.indexOf(id), 1);
            this.setIdsStorage(entitiesId);

            this.manager.storage.unset(
                this.manager.storage.key(
                    [ this.getEntityName(), id ]
                )
            );

            if (fireEvents) {
                this.manager.fireEvents('afterRemove', this, id);
            }

            this.console.log(
                '%s #%s deleted',
                this.getEntityName(),
                id
            );
        }

        this.console.groupEnd();
    };

    this.save = this._save = function(entity, fireEvents) {
        if (entity.getId() === undefined) {
            entity.setId(this.getNewId());
        }

        if (fireEvents === undefined) {
            fireEvents = true;
        }

        this.console.group(
            'Saving %s #%s',
            this.getEntityName(),
            entity.getId()
        );

        if (entity.getId() !== entity._oldId && entity._oldId !== null) {
            this.remove(entity._oldId, fireEvents);
        }

        var entitiesId = this.getIdsStorage();
        if (entitiesId.indexOf(entity.getId()) == -1) {
            entitiesId.push(entity.getId());
            this.setIdsStorage(entitiesId);
        }

        this.manager.storage.set(
            this.manager.storage.key(
                [ this.getEntityName(), entity.getId() ]
            ),
            this.getEntityData(entity)
        );

        entity._oldId = entity.getId();

        if (fireEvents) {
            this.manager.fireEvents('afterSave', this, entity);
        }

        this.console.groupEnd();
        this.console.log(
            '%s #%s saved',
            this.getEntityName(),
            entity.getId()
        );
    };

    this.setIdsStorage = this._setIdsStorage = function(entitiesId) {
        this.manager.storage.set(this.getIdsStorageKey(), entitiesId);
    };
}

function Entity(repository) {
    this._repository = repository;

    if (this._repository.metadata.fields.id === undefined) {
        this._repository.metadata.fields.id = {};
    }

    // PROPERTIES
    this._oldId = null;

    this.get = this._get = function(field) {
        return this._repository.manager.fixValueType(
            this[field],
            this._repository.metadata.fields[field]
        );
    };

    this.set = this._set = function(field, value) {
        this[field] = this._repository.manager.fixValueType(
            value,
            this._repository.metadata.fields[field]
        );

        return this;
    };

    var methods = {};
    if (this._repository.metadata.methods && this._repository.metadata.methods.entity) {
        methods = this._repository.metadata.methods.entity;
    }

    var method;

    for (var field in this._repository.metadata.fields) {
        methodGet = this._repository.getMethodName('get', field);

        if (methods[methodGet] === undefined) {
            this[methodGet] = eval(
                'f = function() {' +
                    'return this.get("' + field + '");' +
                '}'
            );
        }

        methodSet = this._repository.getMethodName('set', field);

        if (methods[methodSet] === undefined) {
            this[methodSet] = eval(
                'f = function(value) {' +
                    'return this.set("' + field + '", value);' +
                '}'
            );
        }
    }

    this._repository.manager.extend(
        this,
        methods
    );
}