/// <reference path="./Entity.ts" />
/// <reference path="./EntityRelation.ts" />
/// <reference path="./LocalStorage.ts" />
/// <reference path="./Repository.ts" />

class LSDManager {
    public static $migrations = [];
    public $INDEX_PREFIX      = '$';
    public $databaseVersion   = null;
    public $entity            = {};
    public $entityClasses     = {};
    public $entityDefinitions = {};
    public $entityProperties  = {};
    public $eventId           = 0;
    public $events            = {};
    public $lastId            = 0;
    public $repositories      = {};
    public $repositoryClasses = {};
    public $storage;
    public $useIndex          = true;
    public $useShortcut       = true;

    private $cache = {};

    constructor(injectStorage: LocalStorage = null) {
        if (injectStorage) {
            this.$storage = injectStorage;
        } else {
            this.$storage = new LocalStorage('lsd');
        }

        this.resetCache();

        // call init method
        this.__init__();
    }

    static addMigration(migration) {
        LSDManager.$migrations.push(migration);
    }

    __init__() {
    }

    /**
     * 2 Signatures:
     *   -  entityName, id, value
     *   -  entity
     *
     * @param arg1
     * @param id
     * @param value
     */
    addToCache(arg1: string | Entity, id: number = undefined, value: any = undefined) {
        let entityName: string;

        if (!id && !value && arg1 instanceof Entity) {
            id         = arg1.id;
            value      = arg1;
            entityName = arg1.$repository.$entityName;
        } else {
            entityName = arg1 + '';
        }

        if (this.$cache[ entityName ] === undefined) {
            this.$cache[ entityName ] = {};
        }

        this.$cache[ entityName ][ id ] = value;

        return this;
    }

    checkType(variable, type) {
        return this.getType(variable) === type;
    }

    clone(object) {
        return this.extend(
            object instanceof Array ? [] : {},
            object,
        );
    }

    deleteCollectionFromCache(collection) {
        for (let i = 0; i < collection.length; i++) {
            this.deleteFromCache(collection[ i ]);
        }
    }

    deleteFromCache(arg1: string | Entity, entityId: number = undefined) {
        let entityName: string;

        if (arg1 instanceof Entity) {
            entityName = arg1.$repository.$entityName;

            if (entityId === undefined) {
                entityId = arg1.id;
            }
        } else {
            entityName = arg1;
        }

        if (entityId === undefined && this.hasInCache(entityName)) {
            delete this.$cache[ entityName ];
        } else if (entityId !== undefined && this.hasInCache(entityName, entityId)) {
            delete this.$cache[ entityName ][ entityId ];
        }

        return this;
    }

    disableIndexation() {
        this.$useIndex = false;
    }

    enableIndexation() {
        this.$useIndex = true;
    }

    extend(child, parent) {
        for (let property in parent) {
            if (parent.hasOwnProperty(property)) {
                if (parent[ property ] instanceof Array) {
                    child[ property ] = this.extend([], parent[ property ]);
                } else {
                    child[ property ] = parent[ property ];
                }
            }
        }

        return child;
    }

    extractIdFromData(data) {
        if (data instanceof Entity) {
            return data.id;
        } else if (this.getType(data) === 'object') {
            if (data.id !== undefined) {
                return data.id;
            }
        } else {
            return data;
        }
    }

    filter(data, filter) {
        if (!filter) {
            return data;
        }

        let isArray = true;

        if (!(data instanceof Array)) {
            isArray = false;
            data    = [ data ];
        }

        let results = [];

        for (let i = 0; i < data.length; i++) {
            if (filter(data[ i ])) {
                results.push(data[ i ]);
            }
        }

        return isArray ? results : results[ 0 ];
    }

    fireEvents(eventName, entity) {
        if (this.$events[ eventName ] !== undefined) {
            console.log(Object.keys(this.$events[ eventName ]).length + ' callback(s) for event ' + eventName);

            for (let i in this.$events[ eventName ]) {
                this.$events[ eventName ][ i ](entity);
            }
        }

        return this;
    }

    fixValueType(value, type) {
        if (type === undefined || value === null || value === undefined) {
            value = null;
        } else if (!this.checkType(value, type)) {
            let tmp, i;
            let valueType = this.getType(value);

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
                            0: value,
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
    }

    getCurrentDatabaseVersion() {
        return parseInt(this.$storage.get('version') || 0, 10);
    }

    getDataPrefix() {
        return this.$storage.$prefix;
    }

    getDatabaseVersion() {
        return this.$databaseVersion;
    }

    getEntity(entityName) {
        if (!this.$entity[ entityName ]) {
            let manager = this;

            let getPropertyGetter = function (field) {
                return function () {
                    return this[ manager.getMethodName('get', field) ]();
                };
            };

            let getPropertySetter = function (field) {
                return function (value) {
                    return this[ manager.getMethodName('set', field) ](value);
                };
            };

            let getGetter = function (field) {
                return function () {
                    return this.get(field);
                };
            };

            let getSetter = function (field) {
                return function (value) {
                    return this.set(field, value);
                };
            };

            let strpad = function (input: any, padLength: number = undefined) {
                let string = String(input);

                padLength = padLength || 2;

                while (string.length < padLength) {
                    string = '0' + string;
                }

                return string;
            };

            let getGetterForStorage = function (field, type) {
                if (type === 'date') {
                    return function () {
                        let d = this.get(field);

                        if (d instanceof Date) {
                            return strpad(d.getFullYear(), 4) + '-' + strpad(d.getMonth() + 1) + '-' + strpad(d.getDate());
                        }

                        return null;
                    };
                }

                if (type === 'datetime') {
                    return function () {
                        let d = this.get(field);

                        if (d instanceof Date) {
                            let datetime = '';
                            datetime += strpad(d.getFullYear(), 4) + '-' + strpad(d.getMonth() + 1) + '-' + strpad(d.getDate());
                            datetime += ' ';
                            datetime += strpad(d.getHours()) + ':' + strpad(d.getMinutes()) + ':' + strpad(d.getSeconds());

                            return datetime;
                        }

                        return null;
                    };
                }
            };

            let getSetterFromStorage = function (field, type) {
                if (type === 'datetime') {
                    return function (value) {
                        let date;

                        if (value instanceof Date) {
                            date = value;
                        } else if (this.$manager.checkType(value, 'string')) {
                            date = new Date();

                            let parts = value.split(/[\sT]/);

                            let dateParts = parts[ 0 ].split('-');
                            date.setFullYear(dateParts[ 0 ], dateParts[ 1 ] - 1, dateParts[ 2 ]);

                            let timeParts = parts[ 1 ].split(':');

                            date.setHours(timeParts[ 0 ], timeParts[ 1 ], timeParts[ 2 ], 0);
                        }

                        return this.set(field, date);
                    };
                }
            };

            let entityClass = this.getEntityClass(entityName);
            if (this.isClass(entityClass)) {
                this.$entity[ entityName ] = entityClass;
                entityClass                = entityClass.prototype;
            } else {
                entityClass                = this.clone(this.getEntityClass(entityName));
                this.$entity[ entityName ] = entityClass;
            }

            let field, method;

            let properties = {};

            for (field in this.getEntityDefinition(entityName).fields) {
                if (this.getEntityDefinition(entityName).fields.hasOwnProperty(field)) {
                    properties[ field ] = {
                        get: getPropertyGetter(field),
                        set: getPropertySetter(field),
                    };

                    method = this.getMethodName('get', field);

                    if (entityClass[ method ] === undefined) {
                        entityClass[ method ] = getGetter(field);
                    }

                    method = this.getMethodName('set', field);

                    if (entityClass[ method ] === undefined) {
                        entityClass[ method ] = getSetter(field);
                    }

                    method = this.getMethodName('get', field, 'ForStorage');

                    if (entityClass[ method ] === undefined) {
                        let getter = getGetterForStorage(field, this.getEntityDefinition(entityName).fields[ field ].type);

                        if (getter) {
                            entityClass[ method ] = getter;
                        }
                    }

                    method = this.getMethodName('set', field, 'FromStorage');

                    if (entityClass[ method ] === undefined) {
                        let setter = getSetterFromStorage(field, this.getEntityDefinition(entityName).fields[ field ].type);

                        if (setter) {
                            entityClass[ method ] = setter;
                        }
                    }
                }
            }

            let getRelationGetter = function (relationField, relation) {
                return function (filter) {
                    let data = manager.getRelationCache(this, relation);

                    if (data === undefined) {
                        let repository = manager.getRepository(relation.entity);

                        if (relation.type === 'many') {
                            try {
                                if (relation.referencedField) {
                                    data = repository.findBy(
                                        relation.referencedField,
                                        this.get('id'),
                                    );
                                } else {
                                    data = repository.findByCollection(
                                        'id',
                                        this.get(relationField),
                                    );
                                }
                            } catch (e) {
                                data = undefined;
                            }
                        } else {
                            try {
                                if (relation.referencedField) {
                                    data = repository.findOneBy(
                                        relation.referencedField,
                                        this.get('id'),
                                    );
                                } else {
                                    data = repository.findOneBy(
                                        'id',
                                        this.get(relationField),
                                    );
                                }
                            } catch (e) {
                                data = undefined;
                            }
                        }

                        manager.setRelationCache(this, relation, data);
                    }

                    return manager.filter(data, filter);
                };
            };

            let addCurrentToRelation = function (entity, value) {
                let valueRelations = manager.getEntityDefinition(value.$repository.$entityName).relations;
                let valueRelation;

                for (let relationName in valueRelations) {
                    if (valueRelations[ relationName ].entity === entity.$repository.$entityName) {
                        valueRelation = valueRelations[ relationName ];

                        break;
                    }
                }

                if (!valueRelation) {
                    return;
                }

                let valueRelationName = manager.getRelationName(valueRelation);
                let getterMethod;

                if (valueRelation.type === 'one') {
                    getterMethod = manager.getMethodName('get', valueRelationName);

                    if (value[ getterMethod ] !== undefined && value[ getterMethod ]() !== entity) {
                        let setterMethod = manager.getMethodName('set', valueRelationName);

                        value[ setterMethod ](entity);
                    }
                } else {
                    getterMethod = manager.getMethodName('get', valueRelationName);

                    if (value[ getterMethod ] !== undefined) {
                        let entities = value[ getterMethod ]();

                        if (!entities || entities.indexOf(entity) === -1) {
                            valueRelationName = manager.getRelationName(valueRelation, false);
                            let adderMethod   = manager.getMethodName('add', valueRelationName);

                            value[ adderMethod ](entity);
                        }
                    }
                }
            };

            let getRelationSetter = function (relationField, relation) {
                let setterMethod = manager.getMethodName(
                    'set',
                    relation.referencedField || relationField,
                );

                return function (value) {
                    if (value instanceof Entity) {
                        if (this[ setterMethod ] !== undefined) {
                            this[ setterMethod ](value.id);
                        }

                        manager.setRelationCache(this, relation, value);

                        addCurrentToRelation(this, value);
                    } else {
                        manager.setRelationCache(this, relation, value);
                    }

                    return this;
                };
            };

            let getRelationAdder = function (relationField, relation) {
                return function (value) {
                    let relationCache = manager.getRelationCache(this, relation);

                    if (relationCache === undefined) {
                        // call getter
                        relationCache = this[ manager.lowerCaseFirstLetter(manager.getRelationName(relation)) ];

                        manager.setRelationCache(this, relation, relationCache);
                    }

                    if (!relationCache) {
                        relationCache = [];
                    }

                    if (relationCache.indexOf(value) === -1) {
                        relationCache.push(value);
                    }

                    addCurrentToRelation(this, value);

                    return this;
                };
            };

            let getPropertyRelationGetter = function (relationName) {
                return function () {
                    return this[ manager.getMethodName('get', relationName) ]();
                };
            };

            let getPropertyRelationSetter = function (relationName) {
                return function (value) {
                    return this[ manager.getMethodName('set', relationName) ](value);
                };
            };

            for (field in this.getEntityDefinition(entityName).relations) {
                if (this.getEntityDefinition(entityName).relations.hasOwnProperty(field)) {
                    let relation = this.getEntityDefinition(entityName).relations[ field ];

                    let relationPluralName   = this.getRelationName(relation);
                    let relationSingularName = this.getRelationName(relation, false);

                    properties[ this.lowerCaseFirstLetter(relationPluralName) ] = {
                        get: getPropertyRelationGetter(relationPluralName),
                        set: getPropertyRelationSetter(relationPluralName),
                    };

                    let getterMethod = this.getMethodName('get', relationPluralName);
                    let getter       = getRelationGetter(field, relation);

                    if (entityClass[ '_' + getterMethod ] === undefined) {
                        entityClass[ '_' + getterMethod ] = getter;
                    }

                    if (entityClass[ getterMethod ] === undefined) {
                        entityClass[ getterMethod ] = getter;
                    }

                    let setterMethod = this.getMethodName('set', relationPluralName);
                    let setter       = getRelationSetter(field, relation);

                    if (entityClass[ '_' + setterMethod ] === undefined) {
                        entityClass[ '_' + setterMethod ] = setter;
                    }

                    if (entityClass[ setterMethod ] === undefined) {
                        entityClass[ setterMethod ] = setter;
                    }

                    if (relation.type === 'many') {
                        let adderMethod = this.getMethodName('add', relationSingularName);
                        let adder       = getRelationAdder(field, relation);

                        if (entityClass[ '_' + adderMethod ] === undefined) {
                            entityClass[ '_' + adderMethod ] = adder;
                        }

                        if (entityClass[ adderMethod ] === undefined) {
                            entityClass[ adderMethod ] = adder;
                        }
                    }
                }
            }

            this.$entityProperties[ entityName ] = properties;
        }

        return this.$entity[ entityName ];
    }

    getEntityClass(entityName) {
        if (this.$entityClasses[ entityName ]) {
            return this.$entityClasses[ entityName ];
        }

        return {};
    }

    getEntityDefinition(entityName) {
        if (this.$entityDefinitions[ entityName ]) {
            return this.$entityDefinitions[ entityName ];
        }

        return {};
    }

    getFromCache(entityName, entityId) {
        if (this.hasInCache(entityName, entityId)) {
            return this.$cache[ entityName ][ entityId ];
        }

        return null;
    }

    getMethodName(prefix: string, field: string, suffix: string = undefined) {
        if (!suffix) {
            suffix = '';
        }

        return prefix + field.substring(0, 1).toUpperCase() + field.substring(1) + suffix;
    }

    getNewId(idFactory) {
        let id;

        idFactory = idFactory || function () {
            return -(new Date().getTime());
        };

        do {
            id = idFactory();
        } while (id === this.$lastId);

        this.$lastId = id;

        return id;
    }

    getRelationCache(entity, relation) {
        return entity.$relationsCache[ this.getRelationName(relation) ];
    }

    getRelationName(relation: EntityRelation, pluralize: boolean = undefined) {
        pluralize = pluralize === undefined ? true : pluralize;
        let name  = relation.name || relation.entity;

        if (pluralize && relation.type === 'many') {
            if (name.substr(-1) === 'y') {
                name = name.substr(0, name.length - 1) + 'ies';
            } else {
                name += 's';
            }
        }

        return name;
    }

    getRepositories() {
        let repositories = [];

        for (let entityName in this.$entityDefinitions) {
            repositories.push(
                this.getRepository(entityName),
            );
        }

        return repositories;
    }

    getRepository(entityName) {
        if (!this.isValidEntity(entityName)) {
            throw new Error('Unknown repository for ' + entityName);
        } else {
            if (!this.$repositories[ entityName ]) {
                let repositoryClass = this.getRepositoryClass(entityName);

                if (this.isClass(repositoryClass)) {
                    this.$repositories[ entityName ] = new repositoryClass(this, entityName);
                } else {
                    this.$repositories[ entityName ] = this.extend(
                        new Repository(this, entityName),
                        repositoryClass,
                    );
                }

                this.$repositories[ entityName ].__init__();
            }

            return this.$repositories[ entityName ];
        }
    }

    getRepositoryClass(entityName) {
        if (this.$repositoryClasses[ entityName ]) {
            return this.$repositoryClasses[ entityName ];
        }

        return {};
    }

    getType(o) {
        let TOSTRING = Object.prototype.toString,
            TYPES    = {
                'undefined'        : 'undefined',
                'number'           : 'number',
                'boolean'          : 'boolean',
                'string'           : 'string',
                '[object Function]': 'function',
                '[object Array]'   : 'array',
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
    }

    hasInCache(entityName: string, entityId: number = undefined) {
        if (entityId === undefined) {
            return this.$cache[ entityName ] !== undefined;
        }

        return this.$cache[ entityName ] !== undefined && this.$cache[ entityName ][ entityId ] !== undefined;
    }

    hasRelationCache(entity, relation) {
        return entity.$relationsCache[ this.getRelationName(relation) ] !== undefined;
    }

    isClass(fn) {
        return /^\s*class/.test(fn.toString());
    }

    isValidEntity(entityName) {
        if (this.checkType(this.$entityDefinitions[ entityName ], 'object')) {
            return true;
        } else if (this.checkType(this.$entityClasses[ entityName ], 'object')) {
            return true;
        } else if (this.checkType(this.$repositoryClasses[ entityName ], 'object')) {
            return true;
        }

        return false;
    }

    lowerCaseFirstLetter(string: string) {
        return string.charAt(0).toLowerCase() + string.slice(1);
    }

    migrate() {
        let start = new Date().getTime();

        for (let i = 0; i < LSDManager.$migrations.length; i++) {
            LSDManager.$migrations[ i ](this);
        }

        this.storeDatabaseVersion();

        console.log('Migration done in ' + (new Date().getTime() - start) + 'ms');
    }

    needMigration() {
        let currentVersion = this.getCurrentDatabaseVersion();

        if (currentVersion === this.$databaseVersion) {
            return false;
        }

        if (currentVersion < this.$databaseVersion) {
            return true;
        }

        throw new Error('Incoherent version. Must be in version "' + this.$databaseVersion + '" but "' + currentVersion + '" found.');
    }

    registerEvent(eventName, callback) {
        if (this.$events[ eventName ] === undefined) {
            this.$events[ eventName ] = {};
        }

        this.$events[ eventName ][ this.$eventId ] = callback;

        return this.$eventId++;
    }

    reindexDatabase() {
        console.log('Reindex database');

        for (let entityName in this.$entityDefinitions) {
            let indexFields = Object.keys(
                this.$entityDefinitions[ entityName ].indexes,
            );

            if (indexFields.length > 1) {
                indexFields.splice(indexFields.indexOf('id'), 1);

                console.log('Reindex entity "' + entityName + '" for field(s): ' + indexFields.join(', '));

                let repository = this.getRepository(entityName);
                let indexes    = repository.createIndexesStorage(indexFields);

                for (let fieldName in indexes) {
                    repository.setIndexStorage(fieldName, indexes[ fieldName ]);
                }
            }
        }

        console.log('Reindexation finished');
    }

    removeCollection(collection, fireEvents) {
        let collectionByRepository = {};

        for (let i = 0; i < collection.length; i++) {
            let item       = collection[ i ];
            let entityName = item.$repository.$entityName;

            if (collectionByRepository[ entityName ] === undefined) {
                collectionByRepository[ entityName ] = [];
            }

            collectionByRepository[ entityName ].push(item);
        }

        for (let entityName in collectionByRepository) {
            this.getRepository(entityName).removeCollection(
                collectionByRepository[ entityName ],
                fireEvents,
            );
        }

        return this;
    }

    removeRelationCache(entity, relation) {
        delete entity.$relationsCache[ this.getRelationName(relation) ];
    }

    resetCache() {
        this.$cache = {};

        return this;
    };

    // old id is not set for remove but set for save
    resetRelationsCache(entity, oldId) {
        let entityEquals = function (e1, e2, oldId) {
            return e1 instanceof Entity
                && e1.$repository.$entityName === e2.$repository.$entityName
                && e1.id === (oldId || e2.id);
        };

        let originalEntityName = entity.$repository.$entityName;

        for (let entityName in this.$entityDefinitions) {
            let entityDefinition = this.$entityDefinitions[ entityName ];

            for (let field in entityDefinition.relations) {
                let relation = entityDefinition.relations[ field ];

                if (relation.entity === originalEntityName) {
                    let relationName = this.getRelationName(relation);
                    let setterMethod = this.getMethodName('set', relationName);
                    let getterMethod = this.getMethodName('get', relationName);

                    let cachedIds = [];
                    let cachedField;

                    if (relation.type === 'one') {
                        cachedIds.push(entity.id);

                        if (oldId) {
                            cachedIds.push(oldId);
                        }

                        cachedField = field;
                    } else if (relation.type === 'many') {
                        cachedIds.push(entity[ relation.referencedField ]);

                        cachedField = 'id';
                    }

                    let repository     = this.getRepository(entityName);
                    let cachedEntities = repository.findByCollection(cachedField, cachedIds, undefined, true);

                    for (let i = 0; i < cachedEntities.length; i++) {
                        let cachedEntity = cachedEntities[ i ];
                        let relationValue;

                        try {
                            relationValue = cachedEntity[ getterMethod ]();
                        } catch (e) {
                            return;
                        }

                        if (relation.type === 'one') {
                            if (entityEquals(relationValue, entity, oldId)) {
                                // if old is set, replace entity with the new one
                                // else remove it
                                cachedEntity[ setterMethod ](
                                    oldId ? entity : undefined,
                                );
                            }
                        } else {
                            if (Array.isArray(relationValue)) {
                                for (let i = 0; i < relationValue.length; i++) {
                                    if (entityEquals(relationValue[ i ], entity, oldId)) {
                                        if (oldId) {
                                            // if oldId is set, replace entity with the new one
                                            relationValue.splice(i, 1, entity);
                                        } else {
                                            // else remove it
                                            relationValue.splice(i, 1);
                                        }

                                        break;
                                    }
                                }

                                if (relationValue.length === 0) {
                                    cachedEntity[ setterMethod ](undefined);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    setDataPrefix(prefix) {
        this.$storage.$prefix = prefix;

        return this;
    }

    setDatabaseVersion(version) {
        this.$databaseVersion = parseInt(version, 10);

        return this;
    }

    setEntity(entityName, compiledEntityClass) {
        this.$entity[ entityName ] = compiledEntityClass;

        return this;
    }

    setEntityClass(entityName, entityClass) {
        this.$entityClasses[ entityName ] = entityClass;

        this.setEntity(entityName, null);

        return this;
    }

    setEntityDefinition(entityName, entityDefinition) {
        if (entityDefinition.fields === undefined) {
            entityDefinition.fields = {};
        }

        entityDefinition.fields.id = {
            type    : 'integer',
            shortcut: '_',
            index   : true,
        };

        if (entityDefinition.relations === undefined) {
            entityDefinition.relations = {};
        }

        // check entity shortcut
        if (entityDefinition.shortcut) {
            for (let en in this.$entityDefinitions) {
                if (this.$entityDefinitions.hasOwnProperty(en)) {
                    if (en !== entityName && this.$entityDefinitions[ en ].shortcut === entityDefinition.shortcut) {
                        console.error(
                            'Try to add a new entity "' + entityName + '" definition ' +
                            'with shortcut "' + entityDefinition.shortcut + '" ' +
                            'but it already exists in "' + en + '" entity.',
                        );

                        return;
                    }
                }
            }
        }

        // check fields shortcuts
        entityDefinition.shortcuts = {};
        for (let field in entityDefinition.fields) {
            if (entityDefinition.fields.hasOwnProperty(field)) {
                let shortcut = entityDefinition.fields[ field ].shortcut;

                if (shortcut) {
                    if (entityDefinition.shortcuts[ shortcut ]) {
                        console.error(
                            'Try to add a new entity "' + entityName + '" definition ' +
                            'with a field "' + field + '" ' +
                            'with a shortcut "' + shortcut + '" ' +
                            'but it already exists for field "' + entityDefinition.shortcuts[ shortcut ] + '".',
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

        let getStandardIndexGetter = function (field) {
            return function (entity) {
                return entity.get(field) || entity.$oldValues[ field ];
            };
        };

        let getStandardIndexTransformer = function () {
            return function (value) {
                return value;
            };
        };

        let getStandardIndexableVerificator = function () {
            return function () {
                return true;
            };
        };

        for (let field in entityDefinition.fields) {
            if (entityDefinition.fields.hasOwnProperty(field) && entityDefinition.fields[ field ].index !== undefined) {
                entityDefinition.indexes[ field ] = {
                    shortcut      : entityDefinition.fields[ field ].shortcut || field,
                    getIndex      : getStandardIndexGetter(field),
                    isIndexable   : entityDefinition.fields[ field ].index.indexable || getStandardIndexableVerificator(),
                    transformIndex: entityDefinition.fields[ field ].index.transformer || getStandardIndexTransformer(),
                };
            }
        }

        entityDefinition.dependencies = {};

        this.$entityDefinitions[ entityName ] = entityDefinition;

        this.setEntity(entityName, null);

        this.updateDependencies();

        return this;
    }

    setRelationCache(entity, relation, value) {
        let relationName = this.getRelationName(relation);

        if (value === undefined) {
            delete entity.$relationsCache[ relationName ];
        } else {
            entity.$relationsCache[ relationName ] = value;
        }

        return this;
    }

    setRepositoryClass(entityName, repositoryClass) {
        this.$repositoryClasses[ entityName ] = repositoryClass;

        return this;
    }

    storeDatabaseVersion() {
        this.$storage.set('version', this.$databaseVersion);
    }

    unregisterEvent(eventName, eventId) {
        if (this.$events[ eventName ] && this.$events[ eventName ][ eventId ]) {
            delete this.$events[ eventName ][ eventId ];

            if (Object.keys(this.$events[ eventName ]).length === 0) {
                delete this.$events[ eventName ];
            }
        }

        return this;
    }

    updateDependencies() {
        for (let entityName in this.$entityDefinitions) {
            let entityDefinition = this.$entityDefinitions[ entityName ];

            for (let field in entityDefinition.relations) {
                let relation  = entityDefinition.relations[ field ];
                relation.type = relation.type ? relation.type : 'one';

                let relatedEntityDefinition = this.getEntityDefinition(relation.entity);

                if (relatedEntityDefinition.dependencies) {
                    if (relatedEntityDefinition.dependencies[ entityName ] === undefined) {
                        relatedEntityDefinition.dependencies[ entityName ] = {};
                    }

                    relatedEntityDefinition.dependencies[ entityName ][ field ] = {
                        type: relation.type,
                    };
                }
            }
        }
    }

    useShortcuts(useShortcut) {
        this.$useShortcut = !!useShortcut;
    }
}
