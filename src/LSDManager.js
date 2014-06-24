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

Entity.prototype.toArray = function() {
    var data = this.$repository.getEntityStorageData(this);

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

Repository.prototype.findEntity = Repository.prototype._findEntity = function(id, entityName) {
    var entityKey, entity;

    if (!entityName) {
        entityName = this.$entityName;
    }

    if (!this.$manager.hasInCache(entityName, id)) {
        entityKey = this.$manager.$storage.key( [ entityName, id ] );

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

Repository.prototype.getEntityStorageData = Repository.prototype._getEntityStorageData = function(entity) {
    var data = {}, field, storageMethod;

    for (field in this.getEntityDefinition().fields) {
        if (this.getEntityDefinition().fields.hasOwnProperty(field)) {
            storageMethod = this.$manager.getMethodName('get', field, 'ForStorage');

            if (this.$manager.checkType(entity[storageMethod], 'function')) {
                data[field] = entity[storageMethod]();
            } else {
                data[field] = entity[this.$manager.getMethodName('get', field)]();
            }
        }
    }

    return data;
};

Repository.prototype.getIdsStorageKey = Repository.prototype._getIdsStorageKey = function() {
    return this.$manager.$storage.key(
        [ this.$entityName, '$$ids' ]
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
    var relations = this.getEntityDefinition().relations;

    for (var field in relations) {
        var relation = relations[field];

        var data = entity.get(field);

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

    for (field in data) {
        if (data.hasOwnProperty(field)) {
            methodStorage = this.$manager.getMethodName('set', field, 'FromStorage');
            methodSet     = this.$manager.getMethodName('set', field);

            if (this.$manager.checkType(entity[methodStorage], 'function')) {
                entity[methodStorage](data[field]);
            } else if (this.$manager.checkType(entity[methodSet], 'function')) {
                entity[methodSet](data[field]);
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

Repository.prototype.remove = Repository.prototype._remove = function(id, fireEvents) {
    var entity;

    if (fireEvents === undefined) {
        fireEvents = true;
    }

    console.group('Deleting ' + this.$entityName + ' #' + id);

    var entitiesId = this.getIdsStorage(),
        indexOf    = entitiesId.indexOf(id);

    if (indexOf === -1) {
        console.log('Nothing to delete');
    } else {
        if (fireEvents) {
            entity = this.findEntity(id);
        }

        entitiesId.splice(entitiesId.indexOf(id), 1);
        this.setIdsStorage(entitiesId);

        this.$manager.$storage.unset(
            this.$manager.$storage.key(
                [ this.$entityName, id ]
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
        id = collection[i] instanceof Entity ? collection[i].getId() : collection[i];

        this.remove(id, fireEvents);
    }

    console.groupEnd();

    return this;
};

Repository.prototype.removeDeleted = Repository.prototype._removeDeleted = function(collection, previousIds, fireEvents) {
    console.group('Remove deleted');

    var i, index;

    for (i = 0; i < collection.length; i++) {
        index = previousIds.indexOf(collection[i].getId());

        if (index !== -1) {
            previousIds.splice(index, 1);
        }
    }

    this.removeCollection(previousIds);

    console.groupEnd();

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
            [ this.$entityName, entity.getId() ]
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
        var dependency = entityDefinition.dependencies[entityName];

        var repository = this.$manager.getRepository(entityName);

        var entities;
        if (dependency.type === 'one') {
            entities = repository.findBy(dependency.field, oldId);
        } else if (dependency.type === 'many') {
            entities = repository.query(
                function(currentEntity) {
                    return currentEntity.get(dependency.field).indexOf(oldId) !== -1;
                }
            );
        }

        for (var i = 0; i < entities.length; i++) {
            if (dependency.type === 'one') {
                entities[i].set(
                    dependency.field,
                    entity.getId()
                );
            } else if (dependency.type === 'many') {
                var data = entities[i].get(
                    dependency.field
                );

                var index = data.indexOf(oldId);

                data[index] = entity.getId();

                entities[i].set(
                    dependency.field,
                    data
                );
            }
        }

        repository.saveCollection(entities);
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

    this.$lastId            = 0;
    this.$entity            = {};
    this.$entityClasses     = {};
    this.$entityDefinitions = {};
    this.$eventId           = 0;
    this.$events            = {};
    this.$repositories      = {};
    this.$repositoryClasses = {};

    if (injectStorage) {
        this.$storage = injectStorage;
    } else {
        this.$storage = new Storage('lsd');
    }

    this.resetCache();

    // call init method
    this.init();
}

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
                    value = String(value);
                }
            break;
        }
    }

    return value;
};

LSDManager.prototype.getEntity = LSDManager.prototype._getEntity = function(entityName) {
    if (!this.$entity[entityName]) {
        var getGetter, getSetter, methodGet, methodSet,
            field;

        getGetter = function(field) {
            return function() {
                return this.get(field);
            };
        };

        getSetter = function(field) {
            return function(value) {
                return this.set(field, value);
            };
        };

        this.$entity[entityName] = this.extend(
            {},
            this.getEntityClass(entityName)
        );

        for (field in this.getEntityDefinition(entityName).fields) {
            if (this.getEntityDefinition(entityName).fields.hasOwnProperty(field)) {
                methodGet = this.getMethodName('get', field);

                if (this.$entity[entityName][methodGet] === undefined) {
                    this.$entity[entityName][methodGet] = getGetter(field);
                }

                methodSet = this.getMethodName('set', field);

                if (this.$entity[entityName][methodSet] === undefined) {
                    this.$entity[entityName][methodSet] = getSetter(field);
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
            type: 'integer'
        };
    }

    if (entityDefinition.relations === undefined) {
        entityDefinition.relations = {};
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

LSDManager.prototype.updateDependencies = function() {
    for(var entityName in this.$entityDefinitions) {
        var entityDefinition = this.$entityDefinitions[entityName];

        for (var field in entityDefinition.relations) {
            var relation = entityDefinition.relations[field];
            relation.type = relation.type ? relation.type : 'one';

            var relatedEntityDefinition = this.getEntityDefinition(relation.entity);

            if (relatedEntityDefinition.dependencies) {
                relatedEntityDefinition.dependencies[entityName] = {
                    field: field,
                    type : relation.type
                };
            }
        }
    }
};