(function(window) {
    'use strict';

    function isPromise(object) {
        return object && object.then !== undefined;
    }

    function toPromise(object) {
        if (!isPromise(object)) {
            return Promise.resolve(object);
        }

        return object;
    }

    function promiseForEach(collection, fn, chain) {
        var keys = Object.keys(collection);
        chain    = chain && isPromise(chain) ? chain.then(function() { return 0; }) : Promise.resolve(0);

        return chain.then(
            function loop(i) {
                if (i < keys.length) {
                    return fn(collection[keys[i]], keys[i])
                        .then(
                            function() {
                                return i + 1;
                            }
                        )
                        .then(loop)
                    ;
                }
            }
        );
    }




    var LSDManager = window.LSDManager = function(injectStorage) {
        this.$databaseName      = 'LSDManager';
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

    LSDManager.$migrations       = [];
    LSDManager.$indexedDbSchemas = {};

    LSDManager.addIndexedDbSchema = LSDManager._addIndexedDbSchema = function(version, schema) {
        LSDManager.$indexedDbSchemas[parseInt(version)] = schema;
    };

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

    LSDManager.prototype.checkTypes = LSDManager.prototype._checkTypes = function(variable, types) {
        for (var i = 0; i < types.length; i++) {
            if (this.checkType(variable, types[ i ])) {
                return true;
            }
        }

        return false;
    };

    LSDManager.prototype.clearDatabase = LSDManager.prototype._clearDatabase = function() {
        this.$storage.clear();
        this.openIndexedDb().delete();
    };

    LSDManager.prototype.clone = LSDManager.prototype._clone = function(object) {
        return this.extend(
            object instanceof Array ? [] : {},
            object
        );
    };

    LSDManager.prototype.createEntity = LSDManager.prototype._createEntity = function(entityName, data, useCache, setOldData) {
        if (!data) {
            data = {};
        }

        if (useCache === undefined) {
            useCache = true;
        }

        setOldData = !!setOldData;

        var repository = this.getRepository(entityName);

        var entity = this.extend(
            new Entity(repository),
            this.getEntity(entityName)
        );

        Object.defineProperties(
            entity,
            this.$entityProperties[ entityName ]
        );

        entity.__init__();

        if (data.id === undefined && data._ === undefined) {
            data.id = this.getNewId();
        }

        entity = this.loadEntity(
            entity,
            data
        );

        if (setOldData) {
            entity.$oldId     = entity.id;
            entity.$oldValues = this.clone(entity.$values);
        }

        if (useCache) {
            this.addToCache(entity);
        }

        return entity;
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
            console.group(Object.keys(this.$events[ eventName ]).length + ' callback(s) for event ' + eventName);

            for (var i in this.$events[ eventName ]) {
                this.$events[ eventName ][ i ](entity);
            }

            console.groupEnd();
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

    LSDManager.prototype.getDatabaseName = LSDManager.prototype._getCurrentDatabaseName = function() {
        return this.$databaseName;
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
                        get       : getPropertyGetter(field),
                        set       : getPropertySetter(field),
                        enumerable: true
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
                var driver = this.getEntityDefinition(entityName).driver;

                this.$repositories[ entityName ] = this.extend(
                    new LSDManager[driver + 'Repository'](this, entityName),
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

    LSDManager.prototype.loadEntity = LSDManager.prototype._loadEntity = function(entity, data) {
        var shortcuts = this.getEntityDefinition(entity.$repository.$entityName).shortcuts || {};

        for (var field in data) {
            var value = data[ field ];

            field = shortcuts[ field ] || field;

            var methodSet = this.getMethodName('set', field, 'FromStorage');

            if (!entity[ methodSet ] || !this.checkType(entity[ methodSet ], 'function')) {
                methodSet = this.getMethodName('set', field);

                if (!entity[ methodSet ] || !this.checkType(entity[ methodSet ], 'function')) {
                    continue;
                }
            }

            entity[ methodSet ](value);
        }

        return entity;
    };

    LSDManager.prototype.migrate = LSDManager.prototype._migrate = function() {
        var start = new Date().getTime();

        var p = new Promise(
            function(resolve) {
                resolve();
            }
        );


        for (var i = 0; i < LSDManager.$migrations.length; i++) {
            p.then(
                function(previous) {
                    LSDManager.$migrations[ i ](this);
                }
            );
        }

        var self = this;

        return p
            .then(
                function() {
                    self.storeDatabaseVersion();

                    console.log('Migration done in ' + (new Date().getTime() - start) + 'ms');
                }
            )
        ;
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

    LSDManager.prototype.getIndexedDb = LSDManager.prototype._getIndexedDb = function() {
        if (!this.$database) {
            this.$database = new Dexie(
                this.getDatabaseName(),
                this.getDatabaseVersion()
            );

            for (var version in LSDManager.$indexedDbSchemas) {
                version = parseInt(version);

                this.$database.version(version).stores(
                    LSDManager.$indexedDbSchemas[version]
                );
            }
        }

        return this.$database;
    };

    LSDManager.prototype.openIndexedDb = LSDManager.prototype._openIndexedDb = function() {
        var db = this.getIndexedDb();

        if (!db.isOpen()) {
            db.open();
        }

        return db;
    };

    LSDManager.prototype.registerEvent = LSDManager.prototype._registerEvent = function(eventName, callback) {
        if (this.$events[ eventName ] === undefined) {
            this.$events[ eventName ] = {};
        }

        this.$events[ eventName ][ this.$eventId ] = callback;

        return this.$eventId++;
    };

    LSDManager.prototype.reindexDatabase = LSDManager.prototype._reindexDatabase = function() {
        console.groupCollapsed('Reindex database');

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
        console.groupEnd();
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

    LSDManager.prototype.setDatabaseName = LSDManager.prototype._setDatabaseName = function(name) {
        this.$databaseName = name;

        return this;
    };

    LSDManager.prototype.setDatabaseVersion = LSDManager.prototype._setDatabaseVersion = function(version) {
        this.$databaseVersion = parseInt(version, 10);

        return this;
    };

    LSDManager.prototype.setDataPrefix = LSDManager.prototype._setDataPrefix = function(prefix) {
        this.$storage.$prefix = prefix;

        return this;
    };

    LSDManager.prototype.setDependencies = LSDManager.prototype._setDependencies = function(oldId, entity) {
        var entityDefinition = this.getEntityDefinition(entity.$repository.$entityName);

        var self = this;

        return promiseForEach(
            entityDefinition.dependencies,
            function(dependencies, dependencyName) {
                var repository = self.getRepository(dependencyName);

                return promiseForEach(
                    dependencies,
                    function(dependency, field) {
                        var chain;

                        if (dependency.type === 'one') {
                            chain = toPromise(repository.findBy(field, oldId));
                        } else if (dependency.type === 'many') {
                            if (entityDefinition.fields[ field ]) {
                                chain = toPromise(
                                    repository.query(
                                        function(currentEntity) {
                                            return currentEntity.get(field).indexOf(oldId) !== -1;
                                        }
                                    )
                                );
                            }
                        }

                        if (!chain) {
                            return Promise.resolve();
                        }

                        return chain.then(function(entities) {
                            for (var i = 0; i < entities.length; i++) {
                                console.log(
                                    'Update relation ID in entity "' + dependencyName + '" #' + entities[ i ].getId() +
                                    ' to entity "' + entity.$repository.$entityName + '" #' + entity.getId()
                                );

                                if (dependency.type === 'one') {
                                    entities[ i ].set(
                                        field,
                                        entity.getId()
                                    );
                                } else if (dependency.type === 'many') {
                                    var data = entities[ i ].get(
                                        field
                                    );

                                    var index = data.indexOf(oldId);

                                    data[ index ] = entity.getId();

                                    entities[ i ].set(
                                        field,
                                        data
                                    );
                                }
                            }

                            return toPromise(repository.saveCollection(entities));
                        });
                    }
                );
            }
        );
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
        if (entityDefinition.driver === undefined) {
            entityDefinition.driver = 'LocalStorage';
        }

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
            if (entityDefinition.fields.hasOwnProperty(field) && entityDefinition.fields[ field ].index === true) {
                entityDefinition.indexes[ field ] = {
                    shortcut      : entityDefinition.fields[ field ].shortcut || field,
                    getIndex      : getStandardIndexGetter(field),
                    transformIndex: getStandardIndexTransformer()
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




    var LocalStorage = window.LocalStorage = function(prefix) {
        if (prefix) {
            this.$prefix = prefix;
        } else {
            this.$prefix = 'storage';
        }

        this.$separator = '.';
    };

    LocalStorage.prototype.asyncGet = function(key, defaultValue) {
        return new Promise(
            (resolve) => {
                resolve(this.get(key, defaultValue));
            }
        );
    };

    LocalStorage.prototype.asyncHas = function(key) {
        return new Promise(
            (resolve) => {
                resolve(this.has(key));
            }
        );
    };

    LocalStorage.prototype.asyncKey = function(parts) {
        return new Promise(
            (resolve) => {
                resolve(this.key(parts));
            }
        );
    };

    LocalStorage.prototype.asyncSet = function(key, value) {
        return new Promise(
            (resolve) => {
                resolve(this.set(key, value));
            }
        );
    };

    LocalStorage.prototype.asyncUnset = function(key) {
        return new Promise(
            (resolve) => {
                resolve(this.unset(key));
            }
        );
    };

    LocalStorage.prototype.clear = function(key, defaultValue) {
        localStorage.clear();
    };

    LocalStorage.prototype.get = function(key, defaultValue) {
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

    LocalStorage.prototype.has = function(key) {
        return this.get(key) !== null;
    };

    LocalStorage.prototype.key = function(parts) {
        return parts.join(this.$separator);
    };

    LocalStorage.prototype.set = function(key, value) {
        localStorage.setItem(
            this.key(
                [ this.$prefix, key ]
            ),
            JSON.stringify(value)
        );

        return this;
    };

    LocalStorage.prototype.unset = function(key) {
        localStorage.removeItem(
            this.key(
                [ this.$prefix, key ]
            )
        );

        return this;
    };




    var LSRepository = LSDManager.LocalStorageRepository = function(manager, entityName) {
        this.$manager    = manager;
        this.$entityName = entityName;
    };

    LSRepository.prototype.addIndex = LSRepository.prototype._addIndex = function(indexName, value, id, indexStorage) {
        if (value === undefined || value === null) {
            return false;
        }

        var index;
        if (indexStorage) {
            index = indexStorage;
        } else {
            index = this.getIndexStorage(indexName);
        }

        var updated = false;

        if (indexName === 'id') {
            if (index.indexOf(id) === -1) {
                index.push(id);

                updated = true;
            }
        } else {
            value = this.getEntityDefinition().indexes[ indexName ].transformIndex(value);

            if (index[ value ] === undefined) {
                index[ value ] = [];
            }

            if (index[ value ].indexOf(id) === -1) {
                index[ value ].push(id);

                updated = true;
            }
        }

        if (!indexStorage && updated) {
            this.setIndexStorage(indexName, index);

            return true;
        }

        return false;
    };

    LSRepository.prototype.createEntity = LSRepository.prototype._createEntity = function(data, useCache, setOldData) {
        return this.$manager.createEntity(
            this.$entityName,
            data,
            useCache,
            setOldData
        );
    };

    LSRepository.prototype.createIndexesStorage = LSRepository.prototype._createIndexesStorage = function(indexNames) {
        var entitiesId = this.getIndexStorage('id');

        var returnOne = false;
        if (!(indexNames instanceof Array)) {
            returnOne  = true;
            indexNames = [ indexNames ];
        }

        var indexes = {};
        for (var i = 0; i < indexNames.length; i++) {
            indexes[ indexNames[ i ] ] = {};
        }

        var indexesDefinitions = this.getEntityDefinition().indexes;

        for (var i = 0; i < entitiesId.length; i++) {
            try {
                var entity = this.findEntity(entitiesId[ i ]);
            } catch (e) {
                entitiesId.splice(i, 1);
                this.setIndexStorage('id', entitiesId);
                i--;

                continue;
            }

            for (var j = 0; j < indexNames.length; j++) {
                var indexName = indexNames[ j ];

                this.addIndex(
                    indexName,
                    indexesDefinitions[ indexName ].getIndex(entity),
                    entity.id,
                    indexes[ indexName ]
                );
            }
        }

        if (returnOne) {
            return indexes[ indexNames[ 0 ] ];
        } else {
            return indexes;
        }
    };

    LSRepository.prototype.removeIndexesFromCache = LSRepository.prototype._removeIndexesFromCache = function() {
        var entityDefinition = this.getEntityDefinition();

        for (var indexName in entityDefinition.indexes) {
            this.$manager.deleteFromCache(
                this.$entityName,
                this.$INDEX_PREFIX + indexName
            );
        }
    };

    LSRepository.prototype.findAll = LSRepository.prototype._findAll = function() {
        return this.query(
            function() {
                return true;
            }
        );
    };

    LSRepository.prototype.findBy = LSRepository.prototype._findBy = function(field, value, justOne) {
        // ID
        if (field === 'id') {
            if (!value) {
                return [];
            } else {
                return [ this.findEntity(value) ];
            }
        }

        // INDEX
        var entityDefinition = this.getEntityDefinition();
        if (entityDefinition.indexes[ field ] !== undefined) {
            var index      = this.getIndexStorage(field);
            var indexValue = entityDefinition.indexes[ field ].transformIndex(value);

            if (justOne) {
                if (index[ indexValue ] && index[ indexValue ][ 0 ]) {
                    return [ this.findEntity(index[ indexValue ][ 0 ]) ];
                } else {
                    return [];
                }
            } else {
                var entities = [];

                if (index[ indexValue ]) {
                    for (var i = 0; i < index[ indexValue ].length; i++) {
                        entities.push(this.findEntity(index[ indexValue ][ i ]));
                    }
                }

                return entities;
            }
        }

        // OTHER FIELD
        var start = Date.now();

        var entities = this.query(
            function(entity) {
                return entity[ field ] === value;
            }
        );

        var searchDuration = Date.now() - start;

        if (searchDuration > 500) {
            console.warn(
                'You should add an index on ' + this.$entityName + '.' + field
                + ' (' + searchDuration + 'ms to execute query).'
            );
        }

        if (justOne) {
            if (entities[ 0 ]) {
                return [ entities[ 0 ] ];
            } else {
                return [];
            }
        } else {
            return entities;
        }
    };

    LSRepository.prototype.findByCollection = LSRepository.prototype._findByCollection = function(field, collection) {
        return this.query(
            function(entity) {
                return collection.indexOf(entity[ field ]) !== -1;
            }
        );
    };

    LSRepository.prototype.findEntity = LSRepository.prototype._findEntity = function(id, entityName, useCache) {
        if (!entityName) {
            entityName = this.$entityName;
        }

        if (useCache === undefined) {
            useCache = true;
        }

        if (!useCache || !this.$manager.hasInCache(entityName, id)) {
            var entityKey = this.$manager.$storage.key(
                [ this.getStorageKeyName(entityName), id ]
            );

            if (!this.$manager.$storage.has(entityKey)) {
                throw new Error('Unknown entity ' + this.$entityName + ' with storage key ' + entityKey);
            }

            var entity = this.createEntity(
                this.$manager.$storage.get(entityKey),
                useCache,
                true
            );

            if (useCache) {
                this.$manager.addToCache(entity);
            }

            return entity;
        }

        return this.$manager.getFromCache(entityName, id);
    };

    LSRepository.prototype.findOneBy = LSRepository.prototype._findOneBy = function(field, value) {
        var entities = this.findBy(field, value, true);

        if (entities.length > 0) {
            return entities[ 0 ];
        }

        return null;
    };

    LSRepository.prototype.getCurrentIds = LSRepository.prototype._getCurrentIds = function() {
        return this.getIndexStorage('id');
    };

    LSRepository.prototype.getEntityDefinition = LSRepository.prototype._getEntityDefinition = function() {
        return this.$manager.getEntityDefinition(this.$entityName);
    };

    LSRepository.prototype.getEntityStorageData = LSRepository.prototype._getEntityStorageData = function(entity, useShortCut, removeNull) {
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

                var dataKey = useShortCut ? (this.getEntityDefinition().fields[ field ].shortcut || field) : field;

                if (this.$manager.checkType(entity[ storageMethod ], 'function')) {
                    data[ dataKey ] = entity[ storageMethod ]();
                } else {
                    data[ dataKey ] = entity[ this.$manager.getMethodName('get', field) ]();
                }

                if (removeNull && data[ dataKey ] === null) {
                    delete data[ dataKey ];
                }
            }
        }

        return data;
    };

    LSRepository.prototype.getStorageKeyName = LSRepository.prototype._getStorageKeyName = function(entityName) {
        if (entityName === undefined) {
            entityName = this.$entityName;
        }

        return this.$manager.$useShortcut ? (this.$manager.getEntityDefinition(entityName).shortcut || entityName) : entityName;
    };

    LSRepository.prototype.getIndexStorageKey = LSRepository.prototype._getIndexStorageKey = function(fieldName) {
        return this.$manager.$storage.key(
            [
                this.getStorageKeyName(),
                this.$manager.$INDEX_PREFIX + (
                    this.$manager.$useShortcut ? this.getEntityDefinition().indexes[ fieldName ].shortcut : fieldName
                )
            ]
        );
    };

    LSRepository.prototype.getIndexStorage = LSRepository.prototype._getIndexStorage = function(indexName) {
        var entityName = this.$entityName;
        var cacheName  = this.$manager.$INDEX_PREFIX + indexName;

        if (!this.$manager.hasInCache(entityName, cacheName)) {
            var indexStorage = this.$manager.$storage.get(
                this.getIndexStorageKey(indexName),
                indexName === 'id' ? [] : null
            );

            if (indexStorage === null) {
                if (this.getIndexStorage('id').length === 0) {
                    indexStorage = {};
                } else {
                    indexStorage = this.createIndexesStorage(indexName);
                }

                this.setIndexStorage(indexName, indexStorage);
            } else {
                this.$manager.addToCache(entityName, cacheName, indexStorage);
            }

            return indexStorage;
        }

        return this.$manager.getFromCache(entityName, cacheName);
    };

    LSRepository.prototype.__init__ = function() {
    };

    LSRepository.prototype.isValid = LSRepository.prototype._isValid = function(entity) {
        var entityDefinition = this.getEntityDefinition();

        var fields = entityDefinition.fields;

        for (var fieldName in fields) {
            var data = entity.get(fieldName);

            if (fields[ fieldName ].nullable === false
                && entity.get(fieldName) === null) {
                return false;
            }
        }

        var relations = entityDefinition.relations;

        for (var fieldName in relations) {
            var relation = relations[ fieldName ];

            if (relation.referencedField === undefined) {
                var data = entity.get(fieldName);

                if (relation.type === 'one') {
                    if (data < 0) {
                        return false;
                    }
                } else if (relation.type === 'many') {
                    for (var i = 0; i < data.length; i++) {
                        if (data[ i ] < 0) {
                            return false;
                        }
                    }
                }
            }
        }

        return true;
    };

    LSRepository.prototype.query = LSRepository.prototype._query = function(filter) {
        var entitiesId = this.getIndexStorage('id');
        var entities   = [];

        for (var i = 0; i < entitiesId.length; i++) {
            try {
                var entity = this.findEntity(entitiesId[ i ]);
            } catch (e) {
                entitiesId.splice(i, 1);
                this.setIndexStorage('id', entitiesId);
                i--;

                continue;
            }

            if (filter === undefined || filter(entity)) {
                entities.push(entity);
            }
        }

        return entities;
    };

    LSRepository.prototype.remove = LSRepository.prototype._remove = function(data, fireEvents) {
        var entity, id;

        if (fireEvents === undefined) {
            fireEvents = true;
        }

        console.log('Try to remove:');
        console.log(data);

        if (data instanceof Entity) {
            entity = data;
            id     = entity.getId();
        } else {
            id = this.$manager.extractIdFromData(data);

            if (!id) {
                console.log('Nothing to delete');

                return this;
            }

            entity = this.findEntity(id, null, false);
        }

        if (entity.$isNew()) {
            console.log('It was a new entity. Nothing to delete');

            this.$manager.deleteFromCache(entity);
            this.$manager.resetRelationsCache(entity);

            return this;
        }

        console.group('Deleting ' + this.$entityName + ' #' + id);

        if (this.removeIndex('id', id)) {
            // console.log(entity);

            var entityDefinition = this.getEntityDefinition();

            for (var fieldName in entityDefinition.indexes) {
                if (fieldName !== 'id') {
                    this.removeIndex(
                        fieldName,
                        entityDefinition.indexes[ fieldName ].getIndex(entity),
                        id
                    );
                }
            }

            this.$manager.$storage.unset(
                this.$manager.$storage.key(
                    [ this.getStorageKeyName(), id ]
                )
            );

            this.$manager.deleteFromCache(this.$entityName, id);
            this.$manager.resetRelationsCache(entity);


            if (fireEvents) {
                this.$manager.fireEvents('afterRemove', entity);
            }

            console.log(this.$entityName + ' #' + id + ' deleted');
        } else {
            console.log('Nothing to delete');
        }

        console.groupEnd();

        return this;
    };

    /**
     * Remove collection of objects | object identifiers
     */
    LSRepository.prototype.removeCollection = LSRepository.prototype._removeCollection = function(collection, fireEvents) {
        console.group('Remove collection');

        for (var i = 0; i < collection.length; i++) {
            try {
                var item = collection[ i ];

                this.remove(
                    item,
                    fireEvents
                );

                if (collection.indexOf(item) === -1) {
                    i--;
                }
            } catch (e) {
            }
        }

        console.groupEnd();

        return this;
    };

    LSRepository.prototype.removeDeleted = LSRepository.prototype._removeDeleted = function(collection, previousIds, fireEvents) {
        if (previousIds.length > 0) {
            console.group('Remove deleted for entity "' + this.$entityName + '"');

            previousIds = this.$manager.clone(previousIds);

            for (var i = 0; i < collection.length; i++) {
                var id = this.$manager.extractIdFromData(collection[ i ]);

                var index = previousIds.indexOf(id);

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

    LSRepository.prototype.removeIndex = LSRepository.prototype._removeIndex = function(fieldName, fieldValue, id) {
        if (fieldValue === undefined || fieldValue === null) {
            return false;
        }

        var index  = this.getIndexStorage(fieldName);
        var indexOf, fieldIndex;
        fieldValue = this.getEntityDefinition().indexes[ fieldName ].transformIndex(fieldValue);

        if (fieldName === 'id') {
            fieldIndex = index;
            indexOf    = index.indexOf(fieldValue);
        } else {
            fieldIndex = index[ fieldValue ];
            indexOf    = fieldIndex ? fieldIndex.indexOf(id) : -1;
        }

        if (indexOf !== -1) {
            fieldIndex.splice(indexOf, 1);

            if (fieldName !== 'id' && fieldIndex.length === 0) {
                delete index[ fieldValue ];
            }

            this.setIndexStorage(fieldName, index);

            return true;
        }

        return false;
    };

    LSRepository.prototype.save = LSRepository.prototype._save = function(entity, fireEvents) {
        var id = entity.getId();

        if (id === null) {
            id = this.$manager.getNewId();

            entity.setId(id);
        }

        if (fireEvents === undefined) {
            fireEvents = true;
        }

        if (!entity.$isModified()) {
            console.log('Entity ' + this.$entityName + ' #' + id + ' is not modified. Save canceled.');

            return false;
        }

        console.group('Saving ' + this.$entityName + ' #' + id);
        // console.log(entity);

        var changingId = id !== entity.$oldId && entity.$oldId !== null;

        if (changingId) {
            this.remove(entity.$oldId, fireEvents);
        }

        var indexFields;
        if (this.$manager.$useIndex) {
            var entityDefinition = this.getEntityDefinition();

            indexFields = Object.keys(entityDefinition.indexes);
        } else {
            indexFields = [ 'id' ];
        }

        for (var i = 0; i < indexFields.length; i++) {
            var indexField = indexFields[ i ];

            var newValue = entity[ indexField ];
            var oldValue = entity.$oldValues[ indexField ];

            if (newValue !== oldValue || changingId) {
                this.removeIndex(
                    indexField,
                    oldValue,
                    changingId ? entity.$oldId : id
                );

                this.addIndex(
                    indexField,
                    newValue,
                    id
                );
            }
        }

        this.$manager.$storage.set(
            this.$manager.$storage.key(
                [ this.getStorageKeyName(), id ]
            ),
            this.getEntityStorageData(entity)
        );

        entity.$oldId     = id;
        entity.$oldValues = this.$manager.clone(entity.$values);

        this.$manager.addToCache(entity);
        if (this.$manager.$useIndex) {
            this.$manager.resetRelationsCache(entity);
        }

        if (fireEvents) {
            this.$manager.fireEvents('afterSave', entity);
        }

        console.groupEnd();
        console.log(this.$entityName + ' #' + entity.getId() + ' saved');

        return true;
    };

    LSRepository.prototype.saveCollection = LSRepository.prototype._saveCollection = function(collection, fireEvents) {
        if (collection.length > 0) {
            console.group('Save collection');

            for (var i = 0; i < collection.length; i++) {
                if (collection[ i ] instanceof Entity && collection[ i ].$repository === this) {
                    this.save(collection[ i ], fireEvents);
                }
            }

            console.groupEnd();
        }

        return this;
    };

    LSRepository.prototype.saveInMemory = LSRepository.prototype._saveInMemory = function(entity) {
        var manager = this.$manager;

        var originalEntityName = this.$entityName;

        for (var entityName in manager.$entityDefinitions) {
            var entityDefinition = manager.$entityDefinitions[ entityName ];

            for (var field in entityDefinition.relations) {
                var relation = entityDefinition.relations[ field ];

                if (relation.entity === originalEntityName && relation.type === 'many') {
                    var getterMethod         = manager.getMethodName('get', relation.referencedField);
                    var relationPluralName   = manager.getRelationName(relation);
                    var relationGetterMethod = manager.getMethodName('get', relationPluralName);

                    for (var id in manager.$cache[ entityName ]) {
                        var cachedEntity = manager.$cache[ entityName ][ id ];

                        if (cachedEntity.id === entity[ getterMethod ]()) {
                            if (!manager.hasInCache(entity)) {
                                if (!manager.hasRelationCache(cachedEntity, relation)) {
                                    // load "normal" data before insert memory data in relation cache
                                    cachedEntity[ relationGetterMethod ]();
                                }

                                var relationCache      = manager.getRelationCache(cachedEntity, relation) || [];
                                var isNotCurrentEntity = function(relation) {
                                    return relation.id !== entity.id;
                                };

                                if (relationCache.every(isNotCurrentEntity)) {
                                    relationCache.push(entity);

                                    manager.setRelationCache(cachedEntity, relation, relationCache);
                                }
                            }
                        }
                    }
                }
            }
        }

        entity.$oldId     = id;
        entity.$oldValues = manager.clone(entity.$values);

        manager.addToCache(entity);
    };

    LSRepository.prototype.setIndexStorage = LSRepository.prototype._setIndexStorage = function(fieldName, indexStorage) {
        this.$manager.$storage.set(
            this.getIndexStorageKey(fieldName),
            indexStorage
        );

        this.$manager.addToCache(
            this.$entityName,
            this.$manager.$INDEX_PREFIX + fieldName,
            indexStorage
        );
    };




    var IDBRepository = LSDManager.IndexedDbRepository = function(manager, entityName) {
        this.$manager    = manager;
        this.$entityName = entityName;

        this.$db = manager.openIndexedDb();
    };

    IDBRepository.prototype.collectionToEntities = IDBRepository.prototype._collectionToEntities = function(collection) {
        var self = this;

        var entities = [];

        return collection.each(
            function(data) {
                entities.push(
                    self.createEntity(
                        data,
                        undefined,
                        true
                    )
                );
            }
        ).then(function() {
            return entities;
        });
    };

    IDBRepository.prototype.createEntity = IDBRepository.prototype._createEntity = function(data, useCache, setOldData) {
        return this.$manager.createEntity(
            this.$entityName,
            data,
            useCache,
            setOldData
        );
    };

    IDBRepository.prototype.findAll = IDBRepository.prototype._findAll = function() {
        return this.collectionToEntities(
            this.getTable()
        );
    };

    IDBRepository.prototype.findBy = IDBRepository.prototype._findBy = function(field, value, justOne) {
        var query = {};
        query[field] = value;

        return this.query(query).then(
            function(entities) {
                if (justOne) {
                    if (entities.length > 0) {
                        return [ entities[0] ];
                    } else {
                        return []
                    }
                } else {
                    return entities;
                }
            }
        );
    };

    IDBRepository.prototype.findByCollection = IDBRepository.prototype._findByCollection = function(field, collection) {
        return this.collectionToEntities(
            this.getTable().where(field).anyOf(
                collection.map(
                    function(entity) {
                        return entity[field];
                    }
                )
            )
        );
    };

    IDBRepository.prototype.findEntity = IDBRepository.prototype._findEntity = function(id, entityName, useCache) {
        if (!entityName) {
            entityName = this.$entityName;
        }

        if (useCache === undefined) {
            useCache = true;
        }

        if (!useCache || !this.$manager.hasInCache(entityName, id)) {
            this.$db[entityName].get(id).then(
                function(entity) {
                    if (entity === undefined) {
                        throw new Error('Unknown entity ' + entityName + ' with storage key ' + entityKey);
                    }

                    var entity = this.createEntity(
                        this.$manager.$storage.get(entityKey),
                        useCache,
                        true
                    );

                    if (useCache) {
                        this.$manager.addToCache(entity);
                    }

                    return entity;
                }
            )
        }

        return this.$manager.getFromCache(entityName, id);
    };

    IDBRepository.prototype.findOneBy = IDBRepository.prototype._findOneBy = function(field, value) {
        return this.findBy(field, value, true).then(
            function(entities) {
                if (entities.length > 0) {
                    return entities[ 0 ];
                }

                return null;
            }
        );
    };

    IDBRepository.prototype.getCurrentIds = IDBRepository.prototype._getCurrentIds = function() {
        return this.query().then(function(entities) {
            return entities.map(
                function(entity) {
                    return entity.id;
                }
            );
        });
    };

    IDBRepository.prototype.getEntityDefinition = IDBRepository.prototype._getEntityDefinition = function() {
        return this.$manager.getEntityDefinition(this.$entityName);
    };

    IDBRepository.prototype.getEntityStorageData = IDBRepository.prototype._getEntityStorageData = function(entity, removeNull) {
        var data = {}, field, storageMethod;

        if (removeNull === undefined) {
            removeNull = true;
        }

        for (field in this.getEntityDefinition().fields) {
            if (this.getEntityDefinition().fields.hasOwnProperty(field)) {
                storageMethod = this.$manager.getMethodName('get', field, 'ForStorage');

                if (this.$manager.checkType(entity[ storageMethod ], 'function')) {
                    data[ field ] = entity[ storageMethod ]();
                } else {
                    data[ field ] = entity[ this.$manager.getMethodName('get', field) ]();
                }

                if (removeNull && data[ field ] === null) {
                    delete data[ field ];
                }
            }
        }

        return data;
    };

    IDBRepository.prototype.getIndexValues = IDBRepository.prototype._getIndexValues = function(indexName) {
        var indexValues = {};

        return this.getTable().each(function(data) {
            if (data[indexName] === undefined) {
                throw new Error(indexName + " n'est pas ")
            }

            indexValues[data[indexName]] = true;
        }).then(function() {
            return Object.keys(indexValues);
        });
    };

    IDBRepository.prototype.getTable = IDBRepository.prototype._getTable = function() {
        return this.$db[this.$entityName];
    };

    IDBRepository.prototype.__init__ = function() {
    };

    IDBRepository.prototype.isValid = IDBRepository.prototype._isValid = function(entity) {
        var entityDefinition = this.getEntityDefinition();

        var fields = entityDefinition.fields;

        for (var fieldName in fields) {
            var data = entity.get(fieldName);

            if (fields[ fieldName ].nullable === false
                && entity.get(fieldName) === null) {
                return false;
            }
        }

        var relations = entityDefinition.relations;

        for (var fieldName in relations) {
            var relation = relations[ fieldName ];

            if (relation.referencedField === undefined) {
                var data = entity.get(fieldName);

                if (relation.type === 'one') {
                    if (data < 0) {
                        return false;
                    }
                } else if (relation.type === 'many') {
                    for (var i = 0; i < data.length; i++) {
                        if (data[ i ] < 0) {
                            return false;
                        }
                    }
                }
            }
        }

        return true;
    };

    IDBRepository.prototype.query = IDBRepository.prototype._query = function(filters) {
        var table = this.getTable();
        var collection;

        if (!filters) {
            collection = table.toCollection();
        } else {
            collection = table.where(filters);
        }

        return this.collectionToEntities(collection);
    };

    IDBRepository.prototype.remove = IDBRepository.prototype._remove = function(data, fireEvents) {
        var entity, id;

        if (fireEvents === undefined) {
            fireEvents = true;
        }

        console.log('Try to remove:');
        console.log(data);

        if (data instanceof Entity) {
            entity = data;
            id     = entity.getId();
        } else {
            id = this.$manager.extractIdFromData(data);

            if (!id) {
                console.log('Nothing to delete');

                return;
            }

            entity = this.findEntity(id, null, false);
        }

        if (entity.$isNew()) {
            console.log('It was a new entity. Nothing to delete');

            this.$manager.deleteFromCache(entity);
            this.$manager.resetRelationsCache(entity);

            return;
        }

        console.group('Deleting ' + this.$entityName + ' #' + id);

        var self = this;

        return this.getTable().delete(id)
            .then(
                function() {
                    self.$manager.deleteFromCache(self.$entityName, id);
                    self.$manager.resetRelationsCache(entity);


                    if (fireEvents) {
                        self.$manager.fireEvents('afterRemove', entity);
                    }

                    console.log(self.$entityName + ' #' + id + ' deleted');

                    console.groupEnd();
                }
            )
        ;
    };

    /**
     * Remove collection of objects | object identifiers
     */
    IDBRepository.prototype.removeCollection = IDBRepository.prototype._removeCollection = function(collection, fireEvents) {
        console.group('Remove collection');

        return promiseForEach(
            collection,
            function(item, i) {
                try {
                    var item = collection[ i ];

                    this.remove(
                        item,
                        fireEvents
                    );

                    if (collection.indexOf(item) === -1) {
                        i--;
                    }
                } catch (e) {
                }
            }
        ).then(function() {
            console.groupEnd();
        });
    };

    IDBRepository.prototype.removeDeleted = IDBRepository.prototype._removeDeleted = function(collection, previousIds, fireEvents) {
        if (previousIds && previousIds.then === undefined) {
            previousIds = Promise.resolve(previousIds);
        }

        var self = this;

        return previousIds.then(function(previousIds) {
            var promise = Promise.resolve();

            if (previousIds.length > 0) {
                console.group('Remove deleted for entity "' + self.$entityName + '"');

                previousIds = self.$manager.clone(previousIds);

                for (var i = 0; i < collection.length; i++) {
                    var id = self.$manager.extractIdFromData(collection[ i ]);

                    var index = previousIds.indexOf(id);

                    if (index !== -1) {
                        previousIds.splice(index, 1);
                    }
                }

                if (previousIds.length > 0) {
                    promise.then(function() {
                        return self.removeCollection(previousIds, fireEvents);
                    });
                } else {
                    promise.then(function() {
                        console.log('Nothing to delete');
                    });
                }

                promise.then(function() {
                    console.groupEnd();
                });
            }

            return promise;
        });
    };

    IDBRepository.prototype.save = IDBRepository.prototype._save = function(entity, fireEvents) {
        var id = entity.getId();

        if (id === null) {
            id = this.$manager.getNewId();

            entity.setId(id);
        }

        if (fireEvents === undefined) {
            fireEvents = true;
        }

        if (!entity.$isModified()) {
            console.log('Entity ' + this.$entityName + ' #' + id + ' is not modified. Save canceled.');

            return false;
        }

        console.group('Saving ' + this.$entityName + ' #' + id);
        // console.log(entity);

        var changingId = id !== entity.$oldId && entity.$oldId !== null;

        if (changingId) {
            this.remove(entity.$oldId, fireEvents);
        }

        var self = this;

        return this.$db[ this.$entityName ].put(
            this.getEntityStorageData(entity)
        ).then(
            function() {
                entity.$oldId     = id;
                entity.$oldValues = self.$manager.clone(entity.$values);

                self.$manager.addToCache(entity);
                if (self.$manager.$useIndex) {
                    self.$manager.resetRelationsCache(entity);
                }

                if (fireEvents) {
                    self.$manager.fireEvents('afterSave', entity);
                }

                console.groupEnd();
                console.log(self.$entityName + ' #' + entity.id + ' saved');

                return entity;
            }
        ).catch(function(e) {
            console.log('Error while saving ' + self.$entityName + ' #' + entity.id);
        });
    };

    IDBRepository.prototype.saveCollection = IDBRepository.prototype._saveCollection = function(collection, fireEvents) {
        if (collection.length > 0) {
            console.group('Save collection');

            return promiseForEach(
                collection,
                function(entity) {
                    if (entity instanceof Entity && entity.$repository === this) {
                        return this.save(entity, fireEvents);
                    }
                }
            ).then(function() {
                console.groupEnd();
            });
        }

        return Promise.resolve();
    };

    IDBRepository.prototype.saveInMemory = IDBRepository.prototype._saveInMemory = function(entity) {
        var manager = this.$manager;

        var originalEntityName = this.$entityName;

        for (var entityName in manager.$entityDefinitions) {
            var entityDefinition = manager.$entityDefinitions[ entityName ];

            for (var field in entityDefinition.relations) {
                var relation = entityDefinition.relations[ field ];

                if (relation.entity === originalEntityName && relation.type === 'many') {
                    var getterMethod         = manager.getMethodName('get', relation.referencedField);
                    var relationPluralName   = manager.getRelationName(relation);
                    var relationGetterMethod = manager.getMethodName('get', relationPluralName);

                    for (var id in manager.$cache[ entityName ]) {
                        var cachedEntity = manager.$cache[ entityName ][ id ];

                        if (cachedEntity.id === entity[ getterMethod ]()) {
                            if (!manager.hasInCache(entity)) {
                                if (!manager.hasRelationCache(cachedEntity, relation)) {
                                    // load "normal" data before insert memory data in relation cache
                                    cachedEntity[ relationGetterMethod ]();
                                }

                                var relationCache      = manager.getRelationCache(cachedEntity, relation) || [];
                                var isNotCurrentEntity = function(relation) {
                                    return relation.id !== entity.id;
                                };

                                if (relationCache.every(isNotCurrentEntity)) {
                                    relationCache.push(entity);

                                    manager.setRelationCache(cachedEntity, relation, relationCache);
                                }
                            }
                        }
                    }
                }
            }
        }

        entity.$oldId     = id;
        entity.$oldValues = manager.clone(entity.$values);

        manager.addToCache(entity);
    };




    var Entity = LSDManager.Entity = function(repository) {
        this.$repository     = repository;
        this.$manager        = repository.$manager;
        this.$oldValues      = {};
        this.$values         = {};
        this.$relationsCache = {};
        this.$oldId          = null;
    }

    Entity.prototype.__init__ = function() {
    };

    Entity.prototype.$clone = Entity.prototype._$clone = function() {
        var clone = this.$repository.createEntity(
            this.$toArray()
        );

        if (clone.id > 0) {
            clone.$oldId = clone.id;
        }

        clone.$oldValues = this.$manager.clone(this.$oldValues);

        return clone;
    };

    Entity.prototype.get = Entity.prototype._get = function(field) {
        return this.$manager.fixValueType(
            this.$values[ field ],
            this.$repository.getEntityDefinition().fields[ field ].type
        );
    };

    Entity.prototype.$isNew = Entity.prototype._$isNew = function() {
        return this.$oldId === null;
    };

    Entity.prototype.$isModified = Entity.prototype._$isModified = function(deeply) {
        if (this.$isNew()) {
            return true;
        }

        var fields = this.$repository.getEntityDefinition().fields;

        for (var field in fields) {
            var oldValue = this.$oldValues[field] === undefined ? null : this.$oldValues[field];
            var value    = this.$values[field]    === undefined ? null : this.$values[field];

            if (this.$manager.getType(oldValue) !== this.$manager.getType(value)) {
                return true;
            }

            if (this.$manager.checkTypes(oldValue, [ 'object', 'array' ])) {
                if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
                    return true;
                }
            } else {
                if (oldValue !== value) {
                    return true;
                }
            }
        }

        if (deeply) {
            var objects = [];

            var hasModifiedChildren = function(entity) {
                objects.push(entity);

                var repository = entity.$repository;
                var manager    = entity.$manager;
                var relations  = repository.getEntityDefinition().relations;

                for (var relationField in relations) {
                    var relation     = relations[ relationField ];
                    var relationName = manager.getRelationName(relation);

                    if (entity.$relationsCache[ relationName ]) {
                        var relationData = entity.$relationsCache[ relationName ];

                        if (relation.type === 'one') {
                            relationData = [ relationData ];
                        }

                        for (var i = 0; i < relationData.length; i++) {
                            var relationDataItem = relationData[ i ];

                            if (objects.indexOf(relationDataItem) !== -1) {
                                continue;
                            }

                            if (relationDataItem.$isModified() || hasModifiedChildren(relationDataItem)) {
                                return true;
                            }
                        }
                    }
                }

                return false;
            };

            if (hasModifiedChildren(this)) {
                return true;
            }
        }

        return false;
    };

    Entity.prototype.$load = Entity.prototype._$load = function(data) {
        return this.$manager.loadEntity(this, data);
    };

    Entity.prototype.$remove = Entity.prototype._$remove = function(fireEvents) {
        return this.$repository.remove(this, fireEvents);
    };

    Entity.prototype.$reset = Entity.prototype._$reset = function() {
        this.$values         = this.$manager.clone(this.$oldValues);
        this.$relationsCache = {};
    };

    Entity.prototype.$save = Entity.prototype._$save = function(fireEvents) {
        return this.$repository.save(this, fireEvents);
    };

    Entity.prototype.$saveInMemory = Entity.prototype._$saveInMemory = function() {
        return this.$repository.saveInMemory(this);
    };

    Entity.prototype.set = Entity.prototype._set = function(field, value) {
        var entityDefinition = this.$repository.getEntityDefinition();

        var oldValue = this.$values[ field ];

        if (oldValue !== value) {
            this.$values[ field ] = this.$manager.fixValueType(
                value,
                entityDefinition.fields[ field ].type
            );

            if (entityDefinition.relations[ field ]) {
                this.$manager.removeRelationCache(this, entityDefinition.relations[ field ]);
            }
        }

        return this;
    };

    Entity.prototype.$toArray = Entity.prototype._$toArray = function(useShortCut) {
        return this.$manager.extend(
            {
                _entityName: this.$repository.$entityName
            },
            this.$repository.getEntityStorageData(this, !!useShortCut, false)
        );
    };
}(window));
