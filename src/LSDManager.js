(function(window) {
    'use strict';

    var LSDManager = window.LSDManager = function(injectStorage) {
        this.$databaseVersion   = null;
        this.$lastId            = 0;
        this.$entity            = {};
        this.$entityClasses     = {};
        this.$entityDefinitions = {};
        this.$entityProperties  = {};
        this.$eventId           = 0;
        this.$events            = {};
        this.$repositories      = {};
        this.$repositoryClasses = {};

        this.$INDEX_PREFIX = '$';
        this.$useIndex     = true;
        this.$useShortcut  = true;

        if (injectStorage) {
            this.$storage = injectStorage;
        } else {
            this.$storage = new LocalStorage('lsd');
        }

        this.resetCache();

        // call init method
        this.__init__();
    };

    LSDManager.$migrations = [];

    LSDManager.addMigration = LSDManager._addMigration = function(migration) {
        LSDManager.$migrations.push(migration);
    };

    /**
     * Signatures:
     *     entityName, id, value
     *     entity
     */
    LSDManager.prototype.addToCache = LSDManager.prototype._addToCache = function(entityName, id, value) {
        if (!id && !value && entityName instanceof Entity) {
            id         = entityName.getId();
            value      = entityName;
            entityName = entityName.$repository.$entityName;
        }

        if (this.$cache[ entityName ] === undefined) {
            this.$cache[ entityName ] = {};
        }

        this.$cache[ entityName ][ id ] = value;

        return this;
    };

    LSDManager.prototype.checkType = LSDManager.prototype._checkType = function(variable, type) {
        return this.getType(variable) === type;
    };

    LSDManager.prototype.clone = LSDManager.prototype._clone = function(object) {
        return this.extend(
            object instanceof Array ? [] : {},
            object
        );
    };

    LSDManager.prototype.deleteCollectionFromCache = LSDManager.prototype._deleteCollectionFromCache = function(collection) {
        for (var i = 0; i < collection.length; i++) {
            this.deleteFromCache(collection[ i ]);
        }
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
            delete this.$cache[ entityName ];
        } else if (entityId !== undefined && this.hasInCache(entityName, entityId)) {
            delete this.$cache[ entityName ][ entityId ];
        }

        return this;
    };

    LSDManager.prototype.disableIndexation = LSDManager.prototype._disableIndexation = function() {
        this.$useIndex = false;
    };

    LSDManager.prototype.enableIndexation = LSDManager.prototype._enableIndexation = function() {
        this.$useIndex = true;
    };

    LSDManager.prototype.extend = LSDManager.prototype._extend = function(child, parent) {
        for (var property in parent) {
            if (parent.hasOwnProperty(property)) {
                if (parent[ property ] instanceof Array) {
                    child[ property ] = this.extend([], parent[ property ]);
                } else {
                    child[ property ] = parent[ property ];
                }
            }
        }

        return child;
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
    };


    LSDManager.prototype.filter = LSDManager.prototype._filter = function(data, filter) {
        if (!filter) {
            return data;
        }

        var isArray = true;

        if (!(data instanceof Array)) {
            isArray = false;
            data    = [ data ];
        }

        var results = [];

        for (var i = 0; i < data.length; i++) {
            if (filter(data[ i ])) {
                results.push(data[ i ]);
            }
        }

        return isArray ? results : results[ 0 ];
    };

    LSDManager.prototype.fireEvents = LSDManager.prototype._fireEvents = function(eventName, entity) {
        if (this.$events[ eventName ] !== undefined) {
            console.log(Object.keys(this.$events[ eventName ]).length + ' callback(s) for event ' + eventName);

            for (var i in this.$events[ eventName ]) {
                this.$events[ eventName ][ i ](entity);
            }
        }

        return this;
    };

    LSDManager.prototype.fixValueType = LSDManager.prototype._fixValueType = function(value, type) {
        if (type === undefined || value === null || value === undefined) {
            value = null;
        } else if (!this.checkType(value, type)) {
            var tmp, i;
            var valueType = this.getType(value);

            switch (type) {
                case 'array':
                    if (valueType === 'object') {
                        tmp = [];

                        for (i in value) {
                            if (value.hasOwnProperty(i)) {
                                tmp.push(value[ i ]);
                            }
                        }

                        value = tmp;
                    } else {
                        value = [ value ];
                    }
                    break;

                case 'boolean':
                    if (value === 'false' ||
                        (valueType === 'array' && value.length === 0) ||
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
                            tmp[ i ] = value[ i ];
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
                        if (!(value instanceof Date)) {
                            value = new Date(value);
                        }

                        // current date is an invalid date
                        if (isNaN(value.getTime())) {
                            value = null;
                        } else {
                            value.setHours(0, 0, 0, 0);
                        }
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
        if (!this.$entity[ entityName ]) {
            var manager = this;

            var getPropertyGetter = function(field) {
                return function() {
                    return this[ manager.getMethodName('get', field) ]();
                };
            };

            var getPropertySetter = function(field) {
                return function(value) {
                    return this[ manager.getMethodName('set', field) ](value);
                };
            };

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

            var strpad = function(input, padLength) {
                var string = String(input);

                padLength = padLength || 2;

                while (string.length < padLength) {
                    string = '0' + string;
                }

                return string;
            };

            var getGetterForStorage = function(field, type) {
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
                            datetime += strpad(d.getHours()) + ':' + strpad(d.getMinutes()) + ':' + strpad(d.getSeconds());

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
                        } else if (this.$manager.checkType(value, 'string')) {
                            date = new Date();

                            var parts = value.split(/[\sT]/);

                            var dateParts = parts[ 0 ].split('-');
                            date.setFullYear(dateParts[ 0 ], dateParts[ 1 ] - 1, dateParts[ 2 ]);

                            var timeParts = parts[ 1 ].split(':');

                            date.setHours(timeParts[ 0 ], timeParts[ 1 ], timeParts[ 2 ], 0);
                        }

                        return this.set(field, date);
                    };
                }
            };

            this.$entity[ entityName ] = this.clone(this.getEntityClass(entityName));

            var field, method;

            var properties = {};

            for (field in this.getEntityDefinition(entityName).fields) {
                if (this.getEntityDefinition(entityName).fields.hasOwnProperty(field)) {
                    properties[ field ] = {
                        get: getPropertyGetter(field),
                        set: getPropertySetter(field)
                    };

                    method = this.getMethodName('get', field);

                    if (this.$entity[ entityName ][ method ] === undefined) {
                        this.$entity[ entityName ][ method ] = getGetter(field);
                    }

                    method = this.getMethodName('set', field);

                    if (this.$entity[ entityName ][ method ] === undefined) {
                        this.$entity[ entityName ][ method ] = getSetter(field);
                    }

                    method = this.getMethodName('get', field, 'ForStorage');

                    if (this.$entity[ entityName ][ method ] === undefined) {
                        var getter = getGetterForStorage(field, this.getEntityDefinition(entityName).fields[ field ].type);

                        if (getter) {
                            this.$entity[ entityName ][ method ] = getter;
                        }
                    }

                    method = this.getMethodName('set', field, 'FromStorage');

                    if (this.$entity[ entityName ][ method ] === undefined) {
                        var setter = getSetterFromStorage(field, this.getEntityDefinition(entityName).fields[ field ].type);

                        if (setter) {
                            this.$entity[ entityName ][ method ] = setter;
                        }
                    }
                }
            }

            var getRelationGetter = function(relationField, relation) {
                return function(filter) {
                    var data = manager.getRelationCache(this, relation);

                    if (data === undefined) {
                        var repository = manager.getRepository(relation.entity);

                        if (relation.type === 'many') {
                            try {
                                if (relation.referencedField) {
                                    data = repository.findBy(
                                        relation.referencedField,
                                        this.get('id')
                                    );
                                } else {
                                    data = repository.findByCollection(
                                        'id',
                                        this.get(relationField)
                                    );
                                }
                            } catch (e) {
                                data = [];
                            }
                        } else {
                            try {
                                if (relation.referencedField) {
                                    data = repository.findOneBy(
                                        relation.referencedField,
                                        this.get('id')
                                    );
                                } else {
                                    data = repository.findOneBy(
                                        'id',
                                        this.get(relationField)
                                    );
                                }
                            } catch (e) {
                                data = null;
                            }
                        }

                        manager.setRelationCache(this, relation, data);
                    }

                    return manager.filter(data, filter);
                };
            };

            var addCurrentToRelation = function(entity, value) {
                var valueRelations = manager.getEntityDefinition(value.$repository.$entityName).relations;
                var valueRelation;

                for (var relationName in valueRelations) {
                    if (valueRelations[ relationName ].entity === entity.$repository.$entityName) {
                        valueRelation = valueRelations[ relationName ];

                        break;
                    }
                }

                if (!valueRelation) {
                    return;
                }

                var valueRelationName = manager.getRelationName(valueRelation);
                var getterMethod;

                if (valueRelation.type === 'one') {
                    getterMethod = manager.getMethodName('get', valueRelationName);

                    if (value[ getterMethod ] !== undefined && value[ getterMethod ]() !== entity) {
                        var setterMethod = manager.getMethodName('set', valueRelationName);

                        value[ setterMethod ](entity);
                    }
                } else {
                    getterMethod = manager.getMethodName('get', valueRelationName);

                    if (value[ getterMethod ] !== undefined && value[ getterMethod ]().indexOf(entity) === -1) {
                        valueRelationName = manager.getRelationName(valueRelation, false);
                        var adderMethod   = manager.getMethodName('add', valueRelationName);

                        value[ adderMethod ](entity);
                    }
                }
            };

            var getRelationSetter = function(relationField, relation) {
                var setterMethod = manager.getMethodName(
                    'set',
                    relation.referencedField || relationField
                );

                return function(value) {
                    if (value instanceof Entity) {
                        if (this[ setterMethod ] !== undefined) {
                            this[ setterMethod ](value.getId());
                        }

                        manager.setRelationCache(this, relation, value);

                        addCurrentToRelation(this, value);
                    } else {
                        manager.setRelationCache(this, relation, value);
                    }

                    return this;
                };
            };

            var getRelationAdder = function(relationField, relation) {
                return function(value) {
                    var relationCache = manager.getRelationCache(this, relation);

                    if (relationCache === undefined) {
                        // call getter
                        relationCache = this[ manager.getRelationName(relation).lowerCaseFirstLetter() ];

                        manager.setRelationCache(this, relation, relationCache);
                    }

                    if (relationCache.indexOf(value) === -1) {
                        relationCache.push(value);
                    }

                    addCurrentToRelation(this, value);

                    return this;
                };
            };

            var getPropertyRelationGetter = function(relationName) {
                return function() {
                    return this[ manager.getMethodName('get', relationName) ]();
                };
            };

            var getPropertyRelationSetter = function(relationName) {
                return function(value) {
                    return this[ manager.getMethodName('set', relationName) ](value);
                };
            };

            for (field in this.getEntityDefinition(entityName).relations) {
                if (this.getEntityDefinition(entityName).relations.hasOwnProperty(field)) {
                    var relation = this.getEntityDefinition(entityName).relations[ field ];

                    var relationPluralName   = this.getRelationName(relation);
                    var relationSingularName = this.getRelationName(relation, false);

                    properties[ relationPluralName.lowerCaseFirstLetter() ] = {
                        get: getPropertyRelationGetter(relationPluralName),
                        set: getPropertyRelationSetter(relationPluralName)
                    };

                    var getterMethod = this.getMethodName('get', relationPluralName);
                    var getter   = getRelationGetter(field, relation);

                    if (this.$entity[ entityName ][ '_' + getterMethod ] === undefined) {
                        this.$entity[ entityName ][ '_' + getterMethod ] = getter;
                    }

                    if (this.$entity[ entityName ][ getterMethod ] === undefined) {
                        this.$entity[ entityName ][ getterMethod ] = getter;
                    }

                    var setterMethod = this.getMethodName('set', relationPluralName);
                    var setter       = getRelationSetter(field, relation);

                    if (this.$entity[ entityName ][ '_' + setterMethod ] === undefined) {
                        this.$entity[ entityName ][ '_' + setterMethod ] = setter;
                    }

                    if (this.$entity[ entityName ][ setterMethod ] === undefined) {
                        this.$entity[ entityName ][ setterMethod ] = setter;
                    }

                    if (relation.type === 'many') {
                        var adderMethod = this.getMethodName('add', relationSingularName);
                        var adder       = getRelationAdder(field, relation);

                        if (this.$entity[ entityName ][ '_' + adderMethod ] === undefined) {
                            this.$entity[ entityName ][ '_' + adderMethod ] = adder;
                        }

                        if (this.$entity[ entityName ][ adderMethod ] === undefined) {
                            this.$entity[ entityName ][ adderMethod ] = adder;
                        }
                    }
                }
            }

            this.$entityProperties[ entityName ] = properties;
        }

        return this.$entity[ entityName ];
    };

    LSDManager.prototype.getDataPrefix = LSDManager.prototype._getDataPrefix = function() {
        return this.$storage.$prefix;
    };

    LSDManager.prototype.getEntityClass = LSDManager.prototype._getEntityClass = function(entityName) {
        if (this.$entityClasses[ entityName ]) {
            return this.$entityClasses[ entityName ];
        }

        return {};
    };

    LSDManager.prototype.getEntityDefinition = LSDManager.prototype._getEntityDefinition = function(entityName) {
        if (this.$entityDefinitions[ entityName ]) {
            return this.$entityDefinitions[ entityName ];
        }

        return {};
    };

    LSDManager.prototype.getFromCache = LSDManager.prototype._getFromCache = function(entityName, entityId) {
        if (this.hasInCache(entityName, entityId)) {
            return this.$cache[ entityName ][ entityId ];
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

    LSDManager.prototype.getRelationCache = LSDManager.prototype._getRelationCache = function(entity, relation) {
        return entity.$relationsCache[ this.getRelationName(relation) ];
    };

    LSDManager.prototype.getRelationName = LSDManager.prototype._getRelationName = function(relation, pluralize) {
        pluralize = pluralize === undefined ? true : pluralize;
        var name  = relation.name || relation.entity;

        if (pluralize && relation.type === 'many') {
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
            if (!this.$repositories[ entityName ]) {
                this.$repositories[ entityName ] = this.extend(
                    new Repository(this, entityName),
                    this.getRepositoryClass(entityName)
                );

                this.$repositories[ entityName ].__init__();
            }

            return this.$repositories[ entityName ];
        }
    };

    LSDManager.prototype.getRepositoryClass = LSDManager.prototype._getRepositoryClass = function(entityName) {
        if (this.$repositoryClasses[ entityName ]) {
            return this.$repositoryClasses[ entityName ];
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

        if ((type = TYPES[ typeof o ]) !== undefined) {
            return type;
        }

        if ((type = TYPES[ TOSTRING.call(o) ]) !== undefined) {
            return type;
        }

        if (o) {
            return 'object';
        }

        return 'null';
    };

    LSDManager.prototype.hasInCache = LSDManager.prototype._hasInCache = function(entityName, entityId) {
        if (entityId === undefined) {
            return this.$cache[ entityName ] !== undefined;
        }

        return this.$cache[ entityName ] !== undefined && this.$cache[ entityName ][ entityId ] !== undefined;
    };

    LSDManager.prototype.hasRelationCache = LSDManager.prototype._hasRelationCache = function(entity, relation) {
        return entity.$relationsCache[ this.getRelationName(relation) ] !== undefined;
    };

    LSDManager.prototype.__init__ = function() {
    };

    LSDManager.prototype.isValidEntity = LSDManager.prototype._isValidEntity = function(entityName) {
        if (this.checkType(this.$entityDefinitions[ entityName ], 'object')) {
            return true;
        }

        if (this.checkType(this.$entityClasses[ entityName ], 'object')) {
            return true;
        }

        if (this.checkType(this.$repositoryClasses[ entityName ], 'object')) {
            return true;
        }

        return false;
    };

    LSDManager.prototype.migrate = LSDManager.prototype._migrate = function() {
        var start = new Date().getTime();

        for (var i = 0; i < LSDManager.$migrations.length; i++) {
            LSDManager.$migrations[ i ](this);
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
        if (this.$events[ eventName ] === undefined) {
            this.$events[ eventName ] = {};
        }

        this.$events[ eventName ][ this.$eventId ] = callback;

        return this.$eventId++;
    };

    LSDManager.prototype.reindexDatabase = LSDManager.prototype._reindexDatabase = function() {
        console.log('Reindex database');

        for (var entityName in this.$entityDefinitions) {
            var indexFields = Object.keys(
                this.$entityDefinitions[ entityName ].indexes
            );

            if (indexFields.length > 1) {
                indexFields.splice(indexFields.indexOf('id'), 1);

                console.log('Reindex entity "' + entityName + '" for field(s): ' + indexFields.join(', '));

                var repository = this.getRepository(entityName);
                var indexes    = repository.createIndexesStorage(indexFields);

                for (var fieldName in indexes) {
                    repository.setIndexStorage(fieldName, indexes[ fieldName ]);
                }
            }
        }

        console.log('Reindexation finished');
    };

    LSDManager.prototype.removeCollection = LSDManager.prototype._removeCollection = function(collection, fireEvents) {
        var collectionByRepository = {};

        for (var i = 0; i < collection.length; i++) {
            var item       = collection[ i ];
            var entityName = item.$repository.$entityName;

            if (collectionByRepository[ entityName ] === undefined) {
                collectionByRepository[ entityName ] = [];
            }

            collectionByRepository[ entityName ].push(item);
        }

        for (var entityName in collectionByRepository) {
            this.getRepository(entityName).removeCollection(
                collectionByRepository[ entityName ],
                fireEvents
            );
        }

        return this;
    };

    LSDManager.prototype.removeRelationCache = LSDManager.prototype._removeRelationCache = function(entity, relation) {
        delete entity.$relationsCache[ this.getRelationName(relation) ];
    };

    LSDManager.prototype.resetCache = LSDManager.prototype._resetCache = function() {
        this.$cache = {};

        return this;
    };

    LSDManager.prototype.resetRelationsCache = LSDManager.prototype._resetRelationsCache = function(entity) {
        var originalEntityName = entity.$repository.$entityName;

        for (var entityName in this.$entityDefinitions) {
            var entityDefinition = this.$entityDefinitions[ entityName ];

            for (var field in entityDefinition.relations) {
                var relation = entityDefinition.relations[ field ];

                if (relation.entity === originalEntityName) {
                    for (var id in this.$cache[ entityName ]) {
                        if (id.substr(0, 1) === '$') {
                            continue;
                        }

                        var cachedEntity = this.$cache[ entityName ][ id ];
                        var getterMethod = this.getMethodName('get', this.getRelationName(relation));

                        try {
                            var relationValue = cachedEntity[ getterMethod ]();
                        } catch (e) {
                            continue;
                        }

                        if (relation.type === 'one') {
                            if (relationValue === entity) {
                                var setterMethod = this.getMethodName('set', this.getRelationName(relation));

                                cachedEntity[ setterMethod ](undefined);
                            }
                        } else {
                            var indexOf = relationValue.indexOf(entity);

                            if (indexOf !== -1) {
                                relationValue.splice(indexOf, 1);
                            }
                        }
                    }
                }
            }
        }
    };

    LSDManager.prototype.setDatabaseVersion = LSDManager.prototype._setDatabaseVersion = function(version) {
        this.$databaseVersion = parseInt(version, 10);

        return this;
    };

    LSDManager.prototype.setDataPrefix = LSDManager.prototype._setDataPrefix = function(prefix) {
        this.$storage.$prefix = prefix;

        return this;
    };

    LSDManager.prototype.setEntity = LSDManager.prototype._setEntity = function(entityName, compiledEntityClass) {
        this.$entity[ entityName ] = compiledEntityClass;

        return this;
    };

    LSDManager.prototype.setEntityClass = LSDManager.prototype._setEntityClass = function(entityName, entityClass) {
        this.$entityClasses[ entityName ] = entityClass;

        this.setEntity(entityName, null);

        return this;
    };

    LSDManager.prototype.setEntityDefinition = LSDManager.prototype._setEntityDefinition = function(entityName, entityDefinition) {
        if (entityDefinition.fields === undefined) {
            entityDefinition.fields = {};
        }

        entityDefinition.fields.id = {
            type    : 'integer',
            shortcut: '_',
            index   : true
        };

        if (entityDefinition.relations === undefined) {
            entityDefinition.relations = {};
        }

        // check entity shortcut
        if (entityDefinition.shortcut) {
            for (var en in this.$entityDefinitions) {
                if (this.$entityDefinitions.hasOwnProperty(en)) {
                    if (en !== entityName && this.$entityDefinitions[ en ].shortcut === entityDefinition.shortcut) {
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
                var shortcut = entityDefinition.fields[ field ].shortcut;

                if (shortcut) {
                    if (entityDefinition.shortcuts[ shortcut ]) {
                        console.error(
                            'Try to add a new entity "' + entityName + '" definition ' +
                            'with a field "' + field + '" ' +
                            'with a shortcut "' + shortcut + '" ' +
                            'but it already exists for field "' + entityDefinition.shortcuts[ shortcut ] + '".'
                        );

                        return;
                    }

                    entityDefinition.shortcuts[ shortcut ] = field;
                }
            }
        }

        // manage indexes
        if (entityDefinition.indexes === undefined) {
            entityDefinition.indexes = {};
        }

        var getStandardIndexGetter = function(field) {
            return function(entity) {
                return entity.get(field) || entity.$oldValues[field];
            };
        };

        var getStandardIndexTransformer = function() {
            return function(value) {
                return value;
            };
        };

        for (var field in entityDefinition.fields) {
            if (entityDefinition.fields.hasOwnProperty(field) && entityDefinition.fields[ field ].index !== undefined) {
                entityDefinition.indexes[ field ] = {
                    shortcut      : entityDefinition.fields[ field ].shortcut || field,
                    getIndex      : getStandardIndexGetter(field),
                    transformIndex: entityDefinition.fields[ field ].index.transformer || getStandardIndexTransformer()
                };
            }
        }

        entityDefinition.dependencies = {};

        this.$entityDefinitions[ entityName ] = entityDefinition;

        this.setEntity(entityName, null);

        this.updateDependencies();

        return this;
    };

    LSDManager.prototype.setRelationCache = LSDManager.prototype._setRelationCache = function(entity, relation, value) {
        entity.$relationsCache[ this.getRelationName(relation) ] = value;

        return this;
    };

    LSDManager.prototype.setRepositoryClass = LSDManager.prototype._setRepositoryClass = function(entityName, repositoryClass) {
        this.$repositoryClasses[ entityName ] = repositoryClass;

        return this;
    };

    LSDManager.prototype.storeDatabaseVersion = LSDManager.prototype._storeDatabaseVersion = function() {
        this.$storage.set('version', this.$databaseVersion);
    };

    LSDManager.prototype.unregisterEvent = LSDManager.prototype._unregisterEvent = function(eventName, eventId) {
        if (this.$events[ eventName ] && this.$events[ eventName ][ eventId ]) {
            delete this.$events[ eventName ][ eventId ];

            if (Object.keys(this.$events[ eventName ]).length === 0) {
                delete this.$events[ eventName ];
            }
        }

        return this;
    };

    LSDManager.prototype.updateDependencies = LSDManager.prototype._updateDependencies = function() {
        for (var entityName in this.$entityDefinitions) {
            var entityDefinition = this.$entityDefinitions[ entityName ];

            for (var field in entityDefinition.relations) {
                var relation  = entityDefinition.relations[ field ];
                relation.type = relation.type ? relation.type : 'one';

                var relatedEntityDefinition = this.getEntityDefinition(relation.entity);

                if (relatedEntityDefinition.dependencies) {
                    if (relatedEntityDefinition.dependencies[ entityName ] === undefined) {
                        relatedEntityDefinition.dependencies[ entityName ] = {};
                    }

                    relatedEntityDefinition.dependencies[ entityName ][ field ] = {
                        type: relation.type
                    };
                }
            }
        }
    };

    LSDManager.prototype.useShortcuts = LSDManager.prototype._useShortcuts = function(useShortcut) {
        this.$useShortcut = !!useShortcut;
    };
}(window));
