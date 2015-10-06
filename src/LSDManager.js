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
    'use strict';

    this.$repository = repository;

    this.$oldId = null;
}

Entity.prototype.get = Entity.prototype._get = function(field) {
    return this.$repository.$manager.fixValueType(
        this[field],
        this.$repository.getEntityDefinition().fields[field].type
    );
};

Entity.prototype.init = function() {};

Entity.prototype.set = Entity.prototype._set = function(field, value) {
    this[field] = this.$repository.$manager.fixValueType(
        value,
        this.$repository.getEntityDefinition().fields[field].type
    );

    return this;
};

Entity.prototype.toArray = Entity.prototype.toJSON = function() {
    var data = this.$repository.getEntityStorageData(this, false, false);

    data._entityName = this.$repository.$entityName;

    return data;
};



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
    'use strict';

    this.$manager    = manager;
    this.$entityName = entityName;
}

Repository.prototype.createEntity = Repository.prototype._createEntity = function(data) {
    if (!data) {
        data = {};
    }

    var entity = this.$manager.extend(
        new Entity(this),
        this.$manager.getEntity(this.$entityName)
    );

    entity.init();

    entity = this.loadEntity(
        entity,
        data
    );

    return entity;
};

Repository.prototype.findAll = Repository.prototype._findAll = function() {
    return this.query(
        function() {
            return true;
        }
    );
};

Repository.prototype.findBy = Repository.prototype._findBy = function(field, value) {
    return this.query(
        function(entity) {
            return entity[field] === value;
        }
    );
};

Repository.prototype.findByCollection = Repository.prototype._findByCollection = function(field, collection) {
    return this.query(
        function(entity) {
            return collection.indexOf(entity[field]) !== -1;
        }
    );
};

Repository.prototype.findEntity = Repository.prototype._findEntity = function(id, entityName, useCache) {
    var entityKey, entity;

    if (!entityName) {
        entityName = this.$entityName;
    }

    if (useCache === undefined) {
        useCache = true;
    }

    if (!useCache || !this.$manager.hasInCache(entityName, id)) {
        entityKey = this.$manager.$storage.key(
            [ this.getStorageKeyName(entityName), id ]
        );

        if (!this.$manager.$storage.has(entityKey)) {
            throw new Error('Unknown entity ' + this.$entityName + ' with storage key ' + entityKey);
        }

        entity = this.createEntity(
            this.$manager.$storage.get(entityKey)
        );

        entity.$oldId = entity.id;

        this.$manager.addToCache(entity);
    }

    return this.$manager.getFromCache(entityName, id);
};

Repository.prototype.findOneBy = Repository.prototype._findOneBy = function(field, value) {
    var entities = this.findBy(field, value);

    if (entities.length > 0) {
        return entities[0];
    }

    return null;
};

Repository.prototype.getEntityDefinition = Repository.prototype._getEntityDefinition = function() {
    return this.$manager.getEntityDefinition(this.$entityName);
};

Repository.prototype.getEntityStorageData = Repository.prototype._getEntityStorageData = function(entity, useShortCut, removeNull) {
    var data = {}, field, storageMethod;

    if (useShortCut === undefined) {
        useShortCut = this.$manager.$useShortcut;
    }

    if (removeNull === undefined) {
        removeNull = true;
    }

    for (field in this.getEntityDefinition().fields) {
        if (this.getEntityDefinition().fields.hasOwnProperty(field)) {
            storageMethod = this.$manager.getMethodName('get', field, 'ForStorage');

            var dataKey = useShortCut ? (this.getEntityDefinition().fields[field].shortcut || field) : field;

            if (this.$manager.checkType(entity[storageMethod], 'function')) {
                data[dataKey] = entity[storageMethod]();
            } else {
                data[dataKey] = entity[this.$manager.getMethodName('get', field)]();
            }

            if (removeNull && data[dataKey] === null) {
                delete data[dataKey];
            }
        }
    }

    return data;
};

Repository.prototype.getStorageKeyName = Repository.prototype._getStorageKeyName = function(entityName) {
    if (entityName === undefined) {
        entityName = this.$entityName;
    }

    return this.$manager.$useShortcut ? (this.$manager.getEntityDefinition(entityName).shortcut || entityName) : entityName;
};

Repository.prototype.getIdsStorageKey = Repository.prototype._getIdsStorageKey = function() {
    return this.$manager.$storage.key(
        [ this.getStorageKeyName(), this.$manager.$IDKEY ]
    );
};

Repository.prototype.getIdsStorage = Repository.prototype._getIdsStorage = function() {
    return this.$manager.$storage.get(
        this.getIdsStorageKey(),
        []
    );
};

Repository.prototype.init = function() {};

Repository.prototype.isValid = Repository.prototype._isValid = function(entity) {
    var entityDefinition = this.getEntityDefinition();

    var fields = entityDefinition.fields;

    for (var fieldName in fields) {
        var data = entity.get(fieldName);

        if (fields[fieldName].nullable === false
        && entity.get(fieldName) === null) {
            return false;
        }
    }

    var relations = entityDefinition.relations;

    for (var fieldName in relations) {
        var relation = relations[fieldName];

        var data = entity.get(fieldName);

        if (relation.type === 'one') {
            if (data < 0) {
                return false;
            }
        } else if (relation.type === 'many') {
            for (var i = 0; i < data.length; i++) {
                if (data[i] < 0) {
                    return false;
                }
            }
        }
    }

    return true;
};

Repository.prototype.loadEntity = Repository.prototype._loadEntity = function(entity, data) {
    var field, methodStorage, methodSet;

    var shortcuts = this.getEntityDefinition().shortcuts;

    for (field in data) {
        if (data.hasOwnProperty(field)) {
            var value = data[field];

            field = shortcuts[field] || field;

            methodStorage = this.$manager.getMethodName('set', field, 'FromStorage');
            methodSet     = this.$manager.getMethodName('set', field);

            if (this.$manager.checkType(entity[methodStorage], 'function')) {
                entity[methodStorage](value);
            } else if (this.$manager.checkType(entity[methodSet], 'function')) {
                entity[methodSet](value);
            }
        }
    }

    return entity;
};

Repository.prototype.query = Repository.prototype._query = function(filter) {
    var entitiesId = this.getIdsStorage(),
        entities   = [], entity,
        i;

    for (i = 0; i < entitiesId.length; i++) {
        entity = this.findEntity(entitiesId[i]);

        if (filter === undefined || filter(entity)) {
            entities.push(entity);
        }
    }

    return entities;
};

Repository.prototype.remove = Repository.prototype._remove = function(data, fireEvents) {
    var entity;

    if (fireEvents === undefined) {
        fireEvents = true;
    }

    var id = this.$manager.extractIdFromData(data);

    if (data instanceof Entity) {
        entity = data;
    } else {
        if (fireEvents) {
            entity = this.findEntity(id, null, false);
        }
    }

    console.group('Deleting ' + this.$entityName + ' #' + id);

    var entitiesId = this.getIdsStorage(),
        indexOf    = entitiesId.indexOf(id);

    if (indexOf === -1) {
        console.log('Nothing to delete');
    } else {
        if (fireEvents) {
            console.log(entity);
        }

        entitiesId.splice(entitiesId.indexOf(id), 1);
        this.setIdsStorage(entitiesId);

        this.$manager.$storage.unset(
            this.$manager.$storage.key(
                [ this.getStorageKeyName(), id ]
            )
        );

        this.$manager.deleteFromCache(this.$entityName, id);

        if (fireEvents) {
            this.$manager.fireEvents('afterRemove', this, entity);
        }

        console.log(this.$entityName + ' #' + id + ' deleted');
    }

    console.groupEnd();

    return this;
};

/**
 * Remove collection of objects | object identifiers
 */
Repository.prototype.removeCollection = Repository.prototype._removeCollection = function(collection, fireEvents) {
    var i, id;
    console.group('Remove collection');

    for (i = 0; i < collection.length; i++) {
        this.remove(
            this.$manager.extractIdFromData(collection[i]),
            fireEvents
        );
    }

    console.groupEnd();

    return this;
};

Repository.prototype.removeDeleted = Repository.prototype._removeDeleted = function(collection, previousIds, fireEvents) {
    if (previousIds.length > 0) {
        console.group('Remove deleted');

        for (var i = 0; i < collection.length; i++) {
            var index = previousIds.indexOf(
                this.$manager.extractIdFromData(collection[i])
            );

            if (index !== -1) {
                previousIds.splice(index, 1);
            }
        }

        if (previousIds.length > 0) {
            this.removeCollection(previousIds, fireEvents);
        } else {
            console.log('Nothing to delete');
        }

        console.groupEnd();
    }

    return this;
};

Repository.prototype.save = Repository.prototype._save = function(entity, fireEvents) {
    if (entity.getId() === null) {
        entity.setId(this.$manager.getNewId());
    }

    if (fireEvents === undefined) {
        fireEvents = true;
    }

    console.group('Saving ' + this.$entityName + ' #' + entity.getId());
    console.log(entity);

    if (entity.getId() !== entity.$oldId && entity.$oldId !== null) {
        this.remove(entity.$oldId, fireEvents);
    }

    var entitiesId = this.getIdsStorage();
    if (entitiesId.indexOf(entity.getId()) === -1) {
        entitiesId.push(entity.getId());
        this.setIdsStorage(entitiesId);
    }

    this.$manager.$storage.set(
        this.$manager.$storage.key(
            [ this.getStorageKeyName(), entity.getId() ]
        ),
        this.getEntityStorageData(entity)
    );

    entity.$oldId = entity.getId();

    this.$manager.addToCache(entity);

    if (fireEvents) {
        this.$manager.fireEvents('afterSave', this, entity);
    }

    console.groupEnd();
    console.log(this.$entityName + ' #' + entity.getId() + ' saved');
};

Repository.prototype.saveCollection = Repository.prototype._saveCollection = function(collection, fireEvents) {
    if (collection.length > 0) {
        console.group('Save collection');

        for (var i = 0; i < collection.length; i++) {
            if (collection[i] instanceof Entity && collection[i].$repository === this) {
                this.save(collection[i], fireEvents);
            }
        }

        console.groupEnd();
    }

    return this;
};

Repository.prototype.setDependencies = Repository.prototype._setDependencies = function(oldId, entity) {
    var entityDefinition = this.getEntityDefinition();

    for (var entityName in entityDefinition.dependencies) {
        var repository = this.$manager.getRepository(entityName);

        for (var field in entityDefinition.dependencies[entityName]) {
            var dependency = entityDefinition.dependencies[entityName][field];

            var entities;
            if (dependency.type === 'one') {
                entities = repository.findBy(field, oldId);
            } else if (dependency.type === 'many') {
                entities = repository.query(
                    function(currentEntity) {
                        return currentEntity.get(field).indexOf(oldId) !== -1;
                    }
                );
            }

            for (var i = 0; i < entities.length; i++) {
                console.log(
                    'Update relation ID in entity "' + entityName + '" #' + entities[i].getId() +
                    ' to entity "' + entity.$repository.$entityName + '" #' + entity.getId()
                );
                if (dependency.type === 'one') {
                    entities[i].set(
                        field,
                        entity.getId()
                    );
                } else if (dependency.type === 'many') {
                    var data = entities[i].get(
                        field
                    );

                    var index = data.indexOf(oldId);

                    data[index] = entity.getId();

                    entities[i].set(
                        field,
                        data
                    );
                }
            }

            repository.saveCollection(entities);
        }
    }
};

Repository.prototype.setIdsStorage = Repository.prototype._setIdsStorage = function(entitiesId) {
    this.$manager.$storage.set(this.getIdsStorageKey(), entitiesId);
};



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
    'use strict';

    if (prefix) {
        this.$prefix = prefix;
    } else {
        this.$prefix = 'storage';
    }

    this.$separator = '.';
}

Storage.prototype.get = function(key, defaultValue) {
    var value = localStorage.getItem(
        this.key(
            [ this.$prefix, key ]
        )
    );

    if (value === null) {
        if (defaultValue !== undefined) {
            value = defaultValue;
        }
    } else {
        value = JSON.parse(value);
    }

    return value;
};

Storage.prototype.has = function(key) {
    return this.get(key) !== null;
};

Storage.prototype.key = function(parts) {
    return parts.join(this.$separator);
};

Storage.prototype.set = function(key, value) {
    localStorage.setItem(
        this.key(
            [ this.$prefix, key ]
        ),
        JSON.stringify(value)
    );

    return this;
};

Storage.prototype.unset = function(key) {
    localStorage.removeItem(
        this.key(
            [ this.$prefix, key ]
        )
    );

    return this;
};



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
    'use strict';

    this.$databaseVersion   = null;
    this.$lastId            = 0;
    this.$entity            = {};
    this.$entityClasses     = {};
    this.$entityDefinitions = {};
    this.$eventId           = 0;
    this.$events            = {};
    this.$repositories      = {};
    this.$repositoryClasses = {};

    this.$IDKEY             = '_';
    this.$useShortcut       = true;

    if (injectStorage) {
        this.$storage = injectStorage;
    } else {
        this.$storage = new Storage('lsd');
    }

    this.resetCache();

    // call init method
    this.init();
}

LSDManager.$migrations = [];

LSDManager.addMigration = LSDManager._addMigration = function(migration) {
    LSDManager.$migrations.push(migration);
};

LSDManager.prototype.addToCache = LSDManager.prototype._addToCache = function(entity) {
    if (this.$cache[entity.$repository.$entityName] === undefined) {
        this.$cache[entity.$repository.$entityName] = {};
    }

    this.$cache[entity.$repository.$entityName][entity.getId()] = entity;

    return this;
};

LSDManager.prototype.checkType = LSDManager.prototype._checkType = function(variable, type) {
    return this.getType(variable) === type;
};

LSDManager.prototype.deleteFromCache = LSDManager.prototype._deleteFromCache = function(entity, entityId) {
    var entityName;

    if (entity instanceof Entity) {
        entityName = entity.$repository.$entityName;

        if (entityId === undefined) {
            entityId = entity.getId();
        }
    } else {
        entityName = entity;
    }

    if (entityId === undefined && this.hasInCache(entityName)) {
        delete this.$cache[entityName];
    } else if (entityId !== undefined && this.hasInCache(entityName, entityId)) {
        delete this.$cache[entityName][entityId];
    }

    return this;
};

LSDManager.prototype.extend = LSDManager.prototype._extend = function(parent, child) {
    var i;

    for (i in child) {
        if (child.hasOwnProperty(i)) {
            parent[i] = child[i];
        }
    }

    return parent;
};

LSDManager.prototype.extractIdFromData = LSDManager.prototype._extractIdFromData = function(data) {
    if (data instanceof Entity) {
        return data.getId();
    } else if (this.getType(data) === 'object') {
        if (data.id !== undefined) {
            return data.id;
        }
    } else {
        return data;
    }

    throw new Error('Impossible to extract id from data: ' + JSON.stringify(data));
};

LSDManager.prototype.fireEvents = LSDManager.prototype._fireEvents = function(eventName, repository, data) {
    var i;

    if (this.$events[eventName] !== undefined) {
        console.group('Call ' + this.$events[eventName].length + ' callback(s) for event ' + eventName);

        for (i in this.$events[eventName]) {
            if (this.$events[eventName].hasOwnProperty(i) && i !== 'length') {
                this.$events[eventName][i](repository, data);
            }
        }

        console.groupEnd();
    }

    return this;
};

LSDManager.prototype.fixValueType = LSDManager.prototype._fixValueType = function(value, type) {
    if (type === undefined || value === null || value === undefined) {
        value = null;
    } else if (!this.checkType(value, type)) {
        var tmp, i,
            valueType = this.getType(value);

        switch (type) {
            case 'array':
                if (valueType === 'object') {
                    tmp = [];

                    for (i in value) {
                        if (value.hasOwnProperty(i)) {
                            tmp.push(value[i]);
                        }
                    }

                    value = tmp;
                } else {
                    value = [ value ];
                }
            break;

            case 'boolean':
                if ( value === 'false'  ||
                (valueType === 'array'  && value.length === 0) ||
                (valueType === 'object' && Object.keys(value).length === 0)) {
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

                    for (i = 0; i < value.length; i++) {
                        tmp[i] = value[i];
                    }

                    value = tmp;
                } else if (valueType !== 'object') {
                    value = {
                        0: value
                    };
                }
            break;

            case 'string':
                if (valueType === 'array' || valueType === 'object') {
                    value = JSON.stringify(value);
                } else {
                    value = String(value);
                }
            break;

            case 'date':
                if (value === '') {
                    value = null;
                } else {
                    value = new Date(value);
                    value.setHours(0, 0, 0, 0);
                }
            break;

            case 'datetime':
                if (value === '') {
                    value = null;
                } else {
                    value = new Date(value);
                }
            break;
        }
    }

    return value;
};

LSDManager.prototype.getCurrentDatabaseVersion = LSDManager.prototype._getCurrentDatabaseVersion = function() {
    return parseInt(this.$storage.get('version') || 0, 10);
};

LSDManager.prototype.getDatabaseVersion = LSDManager.prototype._getCurrentDatabaseVersion = function() {
    return this.$databaseVersion;
};

LSDManager.prototype.getEntity = LSDManager.prototype._getEntity = function(entityName) {
    if (!this.$entity[entityName]) {
        var getGetter = function(field) {
            return function() {
                return this.get(field);
            };
        };

        var getSetter = function(field) {
            return function(value) {
                return this.set(field, value);
            };
        };

        var getGetterForStorage = function(field, type) {
            var strpad = function(input, padLength) {
                var string = String(input);

                padLength = padLength || 2;

                while (string.length < padLength) {
                    string = '0' + string;
                }

                return string;
            };

            if (type === 'date') {
                return function() {
                    var d = this.get(field);

                    if (d instanceof Date) {
                        return strpad(d.getFullYear(), 4) + '-' + strpad(d.getMonth() + 1) + '-' + strpad(d.getDate());
                    }

                    return null;
                };
            }

            if (type === 'datetime') {
                return function() {
                    var d = this.get(field);

                    if (d instanceof Date) {
                        var datetime = '';
                        datetime += strpad(d.getFullYear(), 4) + '-' + strpad(d.getMonth() + 1) + '-' + strpad(d.getDate());
                        datetime += ' ';
                        datetime += strpad(d.getHours()) + ':' + strpad(d.getMinutes()) + ':' + strpad(d.getSeconds()) + '.' + strpad(d.getMilliseconds(), 3);

                        return datetime;
                    }

                    return null;
                };
            }
        };

        var getSetterFromStorage = function(field, type) {
            if (type === 'datetime') {
                return function(value) {
                    var date;

                    if (value instanceof Date) {
                        date = value;
                    } else {
                        date = new Date();

                        var parts = value.split(/[\sT]/);

                        var dateParts = parts[0].split('-');
                        date.setFullYear(dateParts[0], dateParts[1] - 1, dateParts[2]);

                        var timeParts = parts[1].split('.');
                        var milliseconds = 0;
                        if (timeParts.length > 1) {
                            milliseconds = timeParts[1];
                        }
                        timeParts = timeParts[0].split(':');

                        date.setHours(timeParts[0], timeParts[1], timeParts[2], milliseconds);
                    }

                    return this.set(field, date);
                };
            }
        };

        this.$entity[entityName] = this.extend(
            {},
            this.getEntityClass(entityName)
        );

        var field, method;

        for (field in this.getEntityDefinition(entityName).fields) {
            if (this.getEntityDefinition(entityName).fields.hasOwnProperty(field)) {
                method = this.getMethodName('get', field);

                if (this.$entity[entityName][method] === undefined) {
                    this.$entity[entityName][method] = getGetter(field);
                }

                method = this.getMethodName('set', field);

                if (this.$entity[entityName][method] === undefined) {
                    this.$entity[entityName][method] = getSetter(field);
                }

                method = this.getMethodName('get', field, 'ForStorage');

                if (this.$entity[entityName][method] === undefined) {
                    var getter = getGetterForStorage(field, this.getEntityDefinition(entityName).fields[field].type);

                    if (getter) {
                        this.$entity[entityName][method] = getter;
                    }
                }

                method = this.getMethodName('set', field, 'FromStorage');

                if (this.$entity[entityName][method] === undefined) {
                    var setter = getSetterFromStorage(field, this.getEntityDefinition(entityName).fields[field].type);

                    if (setter) {
                        this.$entity[entityName][method] = setter;
                    }
                }
            }
        }

        var getRelationGetter = function(field, entity) {
            return function() {
                return this.$repository.$manager.getRepository(entity).findOneBy(
                    'id',
                    this.get(field)
                );
            };
        };

        var getRelationsGetter = function(field, entity) {
            return function() {
                return this.$repository.$manager.getRepository(entity).findByCollection(
                    'id',
                    this.get(field)
                );
            };
        };

        for (field in this.getEntityDefinition(entityName).relations) {
            if (this.getEntityDefinition(entityName).relations.hasOwnProperty(field)) {
                var relation = this.getEntityDefinition(entityName).relations[field];

                method = this.getMethodName('get', this.getRelationName(relation));

                if (this.$entity[entityName][method] === undefined) {
                    var relationGetterMethod;

                    if (relation.type === 'many') {
                        relationGetterMethod = getRelationsGetter;
                    } else {
                        relationGetterMethod = getRelationGetter;
                    }

                    this.$entity[entityName][method] = relationGetterMethod(field, relation.entity);
                }
            }
        }
    }

    return this.$entity[entityName];
};

LSDManager.prototype.getDataPrefix = LSDManager.prototype._getDataPrefix = function() {
    return this.$storage.$prefix;
};

LSDManager.prototype.getEntityClass = LSDManager.prototype._getEntityClass = function(entityName) {
    if (this.$entityClasses[entityName]) {
        return this.$entityClasses[entityName];
    }

    return {};
};

LSDManager.prototype.getEntityDefinition = LSDManager.prototype._getEntityDefinition = function(entityName) {
    if (this.$entityDefinitions[entityName]) {
        return this.$entityDefinitions[entityName];
    }

    return {};
};

LSDManager.prototype.getFromCache = LSDManager.prototype._getFromCache = function(entityName, entityId) {
    if (this.hasInCache(entityName, entityId)) {
        return this.$cache[entityName][entityId];
    }

    return null;
};

LSDManager.prototype.getMethodName = LSDManager.prototype._getMethodName = function(prefix, field, suffix) {
    if (!suffix) {
        suffix = '';
    }

    return prefix + field.substring(0, 1).toUpperCase() + field.substring(1) + suffix;
};

LSDManager.prototype.getNewId = LSDManager.prototype._getNewId = function(idFactory) {
    var id;

    idFactory = idFactory || function() {
        return -(new Date().getTime());
    };

    do {
        id = idFactory();
    } while (id === this.$lastId);

    this.$lastId = id;

    return id;
};

LSDManager.prototype.getRelationName = LSDManager.prototype._getRelationName = function(relation) {
    var name = relation.name || relation.entity;

    if (relation.type === 'many') {
        if (name.substr(-1) === 'y') {
            name = name.substr(0, name.length - 1) + 'ies';
        } else {
            name += 's';
        }
    }

    return name;
};

LSDManager.prototype.getRepositories = LSDManager.prototype._getRepositories = function() {
    var repositories = [];

    for (var entityName in this.$entityDefinitions) {
        repositories.push(
            this.getRepository(entityName)
        );
    }

    return repositories;
};

LSDManager.prototype.getRepository = LSDManager.prototype._getRepository = function(entityName) {
    if (!this.isValidEntity(entityName)) {
        throw new Error('Unknown repository for ' + entityName);
    } else {
        if (!this.$repositories[entityName]) {
            this.$repositories[entityName] = this.extend(
                new Repository(this, entityName),
                this.getRepositoryClass(entityName)
            );

            this.$repositories[entityName].init();
        }

        return this.$repositories[entityName];
    }
};

LSDManager.prototype.getRepositoryClass = LSDManager.prototype._getRepositoryClass = function(entityName) {
    if (this.$repositoryClasses[entityName]) {
        return this.$repositoryClasses[entityName];
    }

    return {};
};

LSDManager.prototype.getType = LSDManager.prototype._getType = function(o) {
    var TOSTRING = Object.prototype.toString,
        TYPES    = {
            'undefined'        : 'undefined',
            'number'           : 'number',
            'boolean'          : 'boolean',
            'string'           : 'string',
            '[object Function]': 'function',
            '[object Array]'   : 'array'
        },
        type;

    if ((type = TYPES[typeof o]) !== undefined) {
        return type;
    }

    if ((type = TYPES[TOSTRING.call(o)]) !== undefined) {
        return type;
    }

    if (o) {
        return 'object';
    }

    return 'null';
};

LSDManager.prototype.hasInCache = LSDManager.prototype._hasInCache = function(entityName, entityId) {
    if (entityId === undefined) {
        return this.$cache[entityName] !== undefined;
    }

    return this.$cache[entityName] !== undefined && this.$cache[entityName][entityId] !== undefined;
};

LSDManager.prototype.init = function() {};

LSDManager.prototype.isValidEntity = LSDManager.prototype._isValidEntity = function(entityName) {
    if (this.checkType(this.$entityDefinitions[entityName], 'object')) {
        return true;
    }

    if (this.checkType(this.$entityClasses[entityName],     'object')) {
        return true;
    }

    if (this.checkType(this.$repositoryClasses[entityName], 'object')) {
        return true;
    }

    return false;
};

LSDManager.prototype.migrate = LSDManager.prototype._migrate = function() {
    var start = new Date().getTime();

    for (var i = 0; i < LSDManager.$migrations.length; i++) {
        LSDManager.$migrations[i](this);
    }

    this.storeDatabaseVersion();

    console.log('Migration done in ' + (new Date().getTime() - start) + 'ms');
};

LSDManager.prototype.needMigration = LSDManager.prototype._needMigration = function() {
    var currentVersion = this.getCurrentDatabaseVersion();

    if (currentVersion === this.$databaseVersion) {
        return false;
    }

    if (currentVersion < this.$databaseVersion) {
        return true;
    }

    throw new Error('Incoherent version. Must be in version "' + this.$databaseVersion + '" but "' + currentVersion + '" found.');
};

LSDManager.prototype.registerEvent = LSDManager.prototype._registerEvent = function(eventName, callback) {
    if (this.$events[eventName] === undefined) {
        this.$events[eventName] = { length: 0 };
    }

    this.$events[eventName][this.$eventId] = callback;
    this.$events[eventName].length++;

    return this.$eventId++;
};

LSDManager.prototype.resetCache = LSDManager.prototype._resetCache = function() {
    this.$cache = {};

    return this;
};

LSDManager.prototype.setEntity = LSDManager.prototype._setEntity = function(entityName, compiledEntityClass) {
    this.$entity[entityName] = compiledEntityClass;

    return this;
};

LSDManager.prototype.setDatabaseVersion = LSDManager.prototype._setDatabaseVersion = function(version) {
    this.$databaseVersion = parseInt(version, 10);
};

LSDManager.prototype.setDataPrefix = LSDManager.prototype._setDataPrefix = function(prefix) {
    this.$storage.$prefix = prefix;

    return this;
};

LSDManager.prototype.setEntityClass = LSDManager.prototype._setEntityClass = function(entityName, entityClass) {
    this.$entityClasses[entityName] = entityClass;

    this.setEntity(entityName, null);

    return this;
};

LSDManager.prototype.setEntityDefinition = LSDManager.prototype._setEntityDefinition = function(entityName, entityDefinition) {
    if (entityDefinition.fields === undefined) {
        entityDefinition.fields = {};
    }

    if (entityDefinition.fields.id === undefined) {
        entityDefinition.fields.id = {
            type     : 'integer',
            shortcut : '_'
        };
    }

    if (entityDefinition.relations === undefined) {
        entityDefinition.relations = {};
    }

    // check entity shortcut
    if (entityDefinition.shortcut) {
        for (var en in this.$entityDefinitions) {
            if (this.$entityDefinitions.hasOwnProperty(en)) {
                if (en !== entityName && this.$entityDefinitions[en].shortcut === entityDefinition.shortcut) {
                    console.error(
                        'Try to add a new entity "' + entityName + '" definition ' +
                        'with shortcut "' + entityDefinition.shortcut + '" ' +
                        'but it already exists in "' + en + '" entity.'
                    );

                    return;
                }
            }
        }
    }

    // check fields shortcuts
    entityDefinition.shortcuts = {};
    for (var field in entityDefinition.fields) {
        if (entityDefinition.fields.hasOwnProperty(field)) {
            var shortcut = entityDefinition.fields[field].shortcut;

            if (shortcut) {
                if (entityDefinition.shortcuts[shortcut]) {
                    console.error(
                        'Try to add a new entity "' + entityName + '" definition ' +
                        'with a field "' + field + '" ' +
                        'with a shortcut "' + shortcut + '" ' +
                        'but it already exists for field "' + entityDefinition.shortcuts[shortcut] + '".'
                    );

                    return;
                }

                entityDefinition.shortcuts[shortcut] = field;
            }
        }
    }

    entityDefinition.dependencies = {};

    this.$entityDefinitions[entityName] = entityDefinition;

    this.setEntity(entityName, null);

    this.updateDependencies();

    return this;
};

LSDManager.prototype.setRepositoryClass = LSDManager.prototype._setRepositoryClass = function(entityName, repositoryClass) {
    this.$repositoryClasses[entityName] = repositoryClass;

    return this;
};

LSDManager.prototype.storeDatabaseVersion = LSDManager.prototype._storeDatabaseVersion = function() {
    this.$storage.set('version', this.$databaseVersion);
};

LSDManager.prototype.unregisterEvent = LSDManager.prototype._unregisterEvent = function(eventName, eventId) {
    if (this.$events[eventName] && this.$events[eventName][eventId]) {
        delete this.$events[eventName][eventId];
        this.$events[eventName].length--;

        if (this.$events[eventName].length === 0) {
            delete this.$events[eventName];
        }
    }

    return this;
};

LSDManager.prototype.updateDependencies = LSDManager.prototype._updateDependencies = function() {
    for(var entityName in this.$entityDefinitions) {
        var entityDefinition = this.$entityDefinitions[entityName];

        for (var field in entityDefinition.relations) {
            var relation = entityDefinition.relations[field];
            relation.type = relation.type ? relation.type : 'one';

            var relatedEntityDefinition = this.getEntityDefinition(relation.entity);

            if (relatedEntityDefinition.dependencies) {
                if (relatedEntityDefinition.dependencies[entityName] === undefined) {
                    relatedEntityDefinition.dependencies[entityName] = {};
                }

                relatedEntityDefinition.dependencies[entityName][field] = {
                    type : relation.type
                };
            }
        }
    }
};

LSDManager.prototype.useShortcuts = LSDManager.prototype._useShortcuts = function(useShortcut) {
    this.$useShortcut = !!useShortcut;
};
