function DataManager() {
    this.eventId          = 0;
    this.events           = {};
    this.entitiesMetadata = {};
    this.storage          = new Storage('datamanager'),

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
    };

    this.getRepository = function(entityName) {
        if (this.entitiesMetadata[entityName] === undefined) {
            throw new Error('Unknown repository for ' + entityName);
        } else {
            var metadata = this.entitiesMetadata[entityName];

            var repository = new Repository(
                entityName,
                metadata,
                this.storage
            );

            return this.extend(
                repository,
                (metadata.methods || {}).repository || {}
            );
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
        }
    };
}

function Storage(prefix) {
    this.prefix    = prefix;
    this.separator = '.';

    this.get = function(key, defaultValue) {
        return JSON.parse(
            localStorage.getItem(
                this.key(
                    [ this.prefix, key ]
                )
            )
        ) || defaultValue || null;
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


function Repository(entityName, metadata, storage) {
    this.entityName = entityName;
    this.metadata   = metadata;
    this.storage    = storage;

    this.nextId = 1;

    this.build = this._build = function(entity) {
        if (this.metadata.fields.id === undefined) {
            this.metadata.fields.id = {};
        }

        if (entity._build === true) {
            return entity;
        }

        // PROPERTIES
        entity._oldId = null;

        // METHODS
        entity.fixValueType = entity._fixValueType = function(field, value) {
            var fieldMetadata = this.metadata.fields[field];

            if (fieldMetadata === undefined) {
                return null;
            }

            var hasGoodType;

            if (fieldMetadata.type == 'array') {
                hasGoodType = value instanceof Array;
            } else {
                hasGoodType = typeof value === fieldMetadata.type;
            }

            if (!hasGoodType) {
                switch (fieldMetadata.type) {
                    case 'integer':
                        value = parseInt(value, 10) || 0;
                    break;

                    case 'float':
                        value = parseFloat(value) || 0.0;
                    break;

                    case 'string':
                        value = '' + value;
                    break;

                    case 'array':
                        if (typeof value === 'object') {
                            var tmp = [];

                            for (var i in value) {
                                tmp.push(value[i]);
                            }

                            value = tmp;
                        } else {
                            value = [ value ];
                        }
                    break;
                }
            }

            return value;
        };

        entity.get = entity._get = function(field) {
            return this.fixValueType(
                field,
                this[field]
            );
        };

        entity.set = entity._set = function(field, value) {
            this[field] = this.fixValueType(field, value);

            return this;
        };

        var methods = (metadata.methods || {}).entity || {};
        var method;

        for (var field in metadata.fields) {
            methodGet = this.getMethodName('get', field);

            if (methods[methodGet] === undefined) {
                entity[methodGet] = eval(
                    'f = function() {' +
                        'return this.get("' + field + '");' +
                    '}'
                );
            }

            methodSet = this.getMethodName('set', field);

            if (methods[methodSet] === undefined) {
                entity[methodSet] = eval(
                    'f = function(value) {' +
                        'return this.set("' + field + '", value);' +
                    '}'
                );
            }
        }

        DataManager.extend(
            entity,
            methods
        );

        entity._build = true;

        return entity;
    };

    this.createEntity = this._createEntity = function(data) {
        return this.loadEntity(
            this.build({}),
            data || {}
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
        var entityKey = this.storage.key(storageKey);

        if (!this.storage.has(entityKey)) {
            throw new Error('Unknown entity ' + this.getEntityName() + ' with storageKey ' + storageKey);
        }

        var entity = this.build(
            this.storage.get(entityKey)
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

    this.getMetadataKey = this._getMetadataKey = function() {
        return this.storage.key(
            [ this.getEntityName(), '_' ]
        );
    };

    this.getMetadata = this._getMetadata = function() {
        return this.storage.get(
            this.getMetadataKey(),
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
        var entitiesId = this.storage.get(
            this.storage.key(
                [ this.getEntityName(), '_' ]
            )
        );

        var entities = [];

        for (var i in entitiesId) {
            var entity = this.getEntity(
                [ this.getEntityName(), entitiesId[i] ]
            );

            if (filter(entity)) {
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
            this.getEntityName(),
            id
        );

        var metadata = this.getMetadata();
        var indexOf = metadata.indexOf(id);
        if (indexOf === -1) {
            console.log('Nothing to delete');
        } else {
            metadata.splice(metadata.indexOf(id), 1);
            this.setMetadata(metadata);

            this.storage.unset(
                this.storage.key(
                    [ this.getEntityName(), id ]
                )
            );

            if (fireEvents) {
                DataManager.fireEvents('afterRemove', this, id);
            }

            console.log(
                '%s #%s deleted',
                this.getEntityName(),
                id
            );
        }

        console.groupEnd();
    };

    this.save = this._save = function(entity, fireEvents) {
        if (entity.getId() === undefined) {
            entity.setId(this.getNewId());
        }

        if (fireEvents === undefined) {
            fireEvents = true;
        }

        console.group(
            'Saving %s #%s',
            this.getEntityName(),
            entity.getId()
        );

        if (entity.getId() !== entity._oldId && entity._oldId !== null) {
            this.remove(entity._oldId, fireEvents);
        }

        var metadata = this.getMetadata();
        if (metadata.indexOf(entity.getId()) == -1) {
            metadata.push(entity.getId());
            this.setMetadata(metadata);
        }

        this.storage.set(
            this.storage.key(
                [ this.getEntityName(), entity.getId() ]
            ),
            this.getEntityData(entity)
        );

        entity._oldId = entity.getId();

        if (fireEvents) {
            DataManager.fireEvents('afterSave', this, entity);
        }

        console.groupEnd();
        console.log(
            '%s #%s saved',
            this.getEntityName(),
            entity.getId()
        );
    };

    this.setMetadata = this._setMetadata = function(metadata) {
        this.storage.set(this.getMetadataKey(), metadata);
    };
}

var Entity = function(metadata) {
    this.metadata = metadata;

    if (this.metadata.fields.id === undefined) {
        this.metadata.fields.id = {};
    }

    // PROPERTIES
    this._oldId = null;

    // METHODS
    this.fixValueType = this._fixValueType = function(field, value) {
        var fieldMetadata = this.metadata.fields[field];

        if (fieldMetadata === undefined) {
            return null;
        }

        var hasGoodType;

        if (fieldMetadata.type == 'array') {
            hasGoodType = value instanceof Array;
        } else {
            hasGoodType = typeof value === fieldMetadata.type;
        }

        if (!hasGoodType) {
            switch (fieldMetadata.type) {
                case 'integer':
                    value = parseInt(value, 10) || 0;
                break;

                case 'float':
                    value = parseFloat(value) || 0.0;
                break;

                case 'string':
                    value = '' + value;
                break;

                case 'array':
                    if (typeof value === 'object') {
                        var tmp = [];

                        for (var i in value) {
                            tmp.push(value[i]);
                        }

                        value = tmp;
                    } else {
                        value = [ value ];
                    }
                break;
            }
        }

        return value;
    };

    this.get = this._get = function(field) {
        return this.fixValueType(
            field,
            this[field]
        );
    };

    this.set = this._set = function(field, value) {
        this[field] = this.fixValueType(field, value);

        return this;
    };

    var methods = (metadata.methods || {}).entity || {};
    var method;

    for (var field in metadata.fields) {
        methodGet = this.getMethodName('get', field);

        if (methods[methodGet] === undefined) {
            entity[methodGet] = eval(
                'f = function() {' +
                    'return this.get("' + field + '");' +
                '}'
            );
        }

        methodSet = this.getMethodName('set', field);

        if (methods[methodSet] === undefined) {
            entity[methodSet] = eval(
                'f = function(value) {' +
                    'return this.set("' + field + '", value);' +
                '}'
            );
        }
    }

    DataManager.extend(
        entity,
        methods
    );

    this._build = true;

    return entity;
};