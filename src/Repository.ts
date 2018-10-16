/// <reference path="./Entity.ts" />

class Repository {
    constructor(public $manager, public $entityName) {
    }

    __init__() {
    }

    addIndex(
        indexName: string,
        value: any                  = undefined,
        entity: Entity              = undefined,
        indexStorage: Array<Number> = undefined,
    ) {
        if (value === undefined || value === null) {
            return false;
        }

        let index;
        if (indexStorage) {
            index = indexStorage;
        } else {
            index = this.getIndexStorage(indexName);
        }

        let updated = false;

        if (indexName === 'id') {
            if (index.indexOf(entity.id) === -1) {
                index.push(entity.id);

                updated = true;
            }
        } else {
            let indexDefinition = this.getEntityDefinition().indexes[ indexName ];

            if (indexDefinition.isIndexable(entity)) {
                value = indexDefinition.transformIndex(value);

                if (index[ value ] === undefined) {
                    index[ value ] = [];
                }

                if (index[ value ].indexOf(entity.id) === -1) {
                    index[ value ].push(entity.id);

                    updated = true;
                }
            }
        }

        if (!indexStorage && updated) {
            this.setIndexStorage(indexName, index);

            return true;
        }

        return false;
    }

    createEntity(data, useCache) {
        if (!data) {
            data = {};
        }

        if (useCache === undefined) {
            useCache = true;
        }

        let manager = this.$manager;

        let entityClass = manager.getEntity(this.$entityName);
        let entity;

        if (manager.isClass(entityClass)) {
            entity = new entityClass(this);
        } else {
            entity = manager.extend(
                new Entity(this),
                entityClass,
            );
        }

        Object.defineProperties(
            entity,
            manager.$entityProperties[ this.$entityName ],
        );

        entity.__init__();

        if (data.id === undefined && data._ === undefined) {
            data.id = manager.getNewId();
        }

        entity = this.loadEntity(
            entity,
            data,
        );

        if (useCache) {
            manager.addToCache(entity);
        }

        return entity;
    }

    createIndexesStorage(indexNames) {
        let entitiesId = this.getIndexStorage('id');

        let returnOne = false;
        if (!(indexNames instanceof Array)) {
            returnOne  = true;
            indexNames = [ indexNames ];
        }

        let indexes = {};
        for (let i = 0; i < indexNames.length; i++) {
            indexes[ indexNames[ i ] ] = {};
        }

        let indexesDefinitions = this.getEntityDefinition().indexes;

        for (let i = 0; i < entitiesId.length; i++) {
            let entity;
            try {
                entity = this.findEntity(entitiesId[ i ]);
            } catch (e) {
                entitiesId.splice(i, 1);
                this.setIndexStorage('id', entitiesId);
                i--;

                continue;
            }

            for (let j = 0; j < indexNames.length; j++) {
                let indexName = indexNames[ j ];

                this.addIndex(
                    indexName,
                    indexesDefinitions[ indexName ].getIndex(entity),
                    entity,
                    indexes[ indexName ],
                );
            }
        }

        if (returnOne) {
            return indexes[ indexNames[ 0 ] ];
        } else {
            return indexes;
        }
    }

    findAll() {
        return this.query(() => {
            return true;
        });
    }

    findBy(field, value, justOne, onlyInCache) {
        // ID
        if (field === 'id') {
            let result = [];

            if (value) {
                let entity = this.findEntity(value, undefined, undefined, onlyInCache);

                if (entity) {
                    result.push(entity);
                }
            }

            return result;
        }

        // INDEX
        let entityDefinition = this.getEntityDefinition();
        if (entityDefinition.indexes[ field ] !== undefined) {
            let index      = this.getIndexStorage(field);
            let indexValue = entityDefinition.indexes[ field ].transformIndex(value);

            if (justOne) {
                let result = [];

                if (index[ indexValue ] && index[ indexValue ][ 0 ]) {
                    let entity = this.findEntity(index[ indexValue ][ 0 ], undefined, undefined, onlyInCache);

                    if (entity) {
                        result.push(entity);
                    }
                }

                return result;
            } else {
                let entities = [];

                if (index[ indexValue ]) {
                    for (let i = 0; i < index[ indexValue ].length; i++) {
                        let entity = this.findEntity(index[ indexValue ][ i ], undefined, undefined, onlyInCache);

                        if (entity) {
                            entities.push(entity);
                        }
                    }
                }

                return entities;
            }
        }

        // OTHER FIELD
        let start = Date.now();

        let entities = this.query(
            function (entity) {
                return entity[ field ] === value;
            },
            onlyInCache,
        );

        let searchDuration = Date.now() - start;

        if (searchDuration > 500) {
            console.warn(
                'You should add an index on ' + this.$entityName + '.' + field
                + ' (' + searchDuration + 'ms to execute query).',
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
    }

    findByCollection(
        field, collection, ignoreMissing, onlyInCache) {
        if (collection.length === 0) {
            return [];
        }

        let entityDefinition = this.getEntityDefinition();
        if (entityDefinition.indexes[ field ] !== undefined) {
            let results = [];

            for (let i = 0; i < collection.length; i++) {
                try {
                    let result = this.findBy(field, collection[ i ], undefined, onlyInCache);

                    results = results.concat(result);
                } catch (e) {
                    if (!ignoreMissing) {
                        throw e;
                    }
                }
            }

            return results;
        } else {
            return this.query(
                function (entity) {
                    return collection.indexOf(entity[ field ]) !== -1;
                },
                onlyInCache,
            );
        }
    }

    findEntity(
        id: Number, entityName: string = undefined, useCache: boolean = undefined, onlyInCache: boolean = undefined,
    ) {
        if (!entityName) {
            entityName = this.$entityName;
        }

        if (useCache === undefined) {
            useCache = true;
        }

        let hasInCache = this.$manager.hasInCache(entityName, id);

        if ((!useCache || !hasInCache) && !onlyInCache) {
            let entityKey = this.$manager.$storage.key(
                [ this.getStorageKeyName(entityName), id ],
            );

            if (!this.$manager.$storage.has(entityKey)) {
                throw new Error('Unknown entity ' + this.$entityName + ' with storage key ' + entityKey);
            }

            let entity = this.createEntity(
                this.getFullData(
                    this.$manager.$storage.get(entityKey),
                ),
                useCache,
            );

            entity.$oldId     = entity.id;
            entity.$oldValues = this.$manager.clone(entity.$values);

            if (useCache) {
                this.$manager.addToCache(entity);
            }

            return entity;
        }

        return this.$manager.getFromCache(entityName, id);
    }

    findOneBy(field, value, onlyInCache) {
        let entities = this.findBy(field, value, true, onlyInCache);

        if (entities.length > 0) {
            return entities[ 0 ];
        }

        return null;
    }

    getEntityDefinition() {
        return this.$manager.getEntityDefinition(this.$entityName);
    }

    getEntityStorageData(entity: Entity, useShortCut: boolean = undefined, removeNull: boolean = undefined) {
        let data = {}, field, storageMethod;

        if (useShortCut === undefined) {
            useShortCut = this.$manager.$useShortcut;
        }

        if (removeNull === undefined) {
            removeNull = true;
        }

        for (field in this.getEntityDefinition().fields) {
            if (this.getEntityDefinition().fields.hasOwnProperty(field)) {
                storageMethod = this.$manager.getMethodName('get', field, 'ForStorage');

                let dataKey = useShortCut ? (this.getEntityDefinition().fields[ field ].shortcut || field) : field;

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
    }

    getFullData(data) {
        let fields = this.getEntityDefinition().fields;

        for (let field in fields) {
            let fieldConf = fields[ field ];

            if (data[ field ] === undefined
                && fieldConf.shortcut !== undefined && data[ fieldConf.shortcut ] === undefined
            ) {
                data[ field ] = null;
            }
        }

        return data;
    }

    getIndexStorage(indexName) {
        let entityName = this.$entityName;
        let cacheName  = this.$manager.$INDEX_PREFIX + indexName;

        if (!this.$manager.hasInCache(entityName, cacheName)) {
            let indexStorage = this.$manager.$storage.get(
                this.getIndexStorageKey(indexName),
                indexName === 'id' ? [] : null,
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
    }

    getIndexStorageKey(fieldName) {
        return this.$manager.$storage.key(
            [
                this.getStorageKeyName(),
                this.$manager.$INDEX_PREFIX + (
                    this.$manager.$useShortcut ? this.getEntityDefinition().indexes[ fieldName ].shortcut : fieldName
                ),
            ],
        );
    }

    getStorageKeyName(entityName: string = undefined) {
        if (entityName === undefined) {
            entityName = this.$entityName;
        }

        return this.$manager.$useShortcut
            ? (this.$manager.getEntityDefinition(entityName).shortcut || entityName)
            : entityName;
    }

    isValid(entity) {
        let entityDefinition = this.getEntityDefinition();

        let fields = entityDefinition.fields;

        for (let fieldName in fields) {
            let data = entity.get(fieldName);

            if (fields[ fieldName ].nullable === false
                && entity.get(fieldName) === null) {
                return false;
            }
        }

        let relations = entityDefinition.relations;

        for (let fieldName in relations) {
            let relation = relations[ fieldName ];

            if (relation.referencedField === undefined) {
                let data = entity.get(fieldName);

                if (relation.type === 'one') {
                    if (data < 0) {
                        return false;
                    }
                } else if (relation.type === 'many') {
                    for (let i = 0; i < data.length; i++) {
                        if (data[ i ] < 0) {
                            return false;
                        }
                    }
                }
            }
        }

        return true;
    }

    loadEntity(entity, data) {
        let field, methodSet;

        let shortcuts = this.getEntityDefinition().shortcuts;

        for (field in data) {
            let value = data[ field ];

            field = shortcuts[ field ] || field;

            methodSet = this.$manager.getMethodName('set', field, 'FromStorage');

            if (!entity[ methodSet ] || !this.$manager.checkType(entity[ methodSet ], 'function')) {
                methodSet = this.$manager.getMethodName('set', field);

                if (!entity[ methodSet ] || !this.$manager.checkType(entity[ methodSet ], 'function')) {
                    continue;
                }
            }

            entity[ methodSet ](value);
        }

        return entity;
    }

    query(filter: Function, onlyInCache: boolean = undefined) {
        let entities   = [];
        let entitiesId = onlyInCache
            ? (this.$manager.$cache[ this.$entityName ] === undefined
                    ? []
                    : Object.keys(this.$manager.$cache[ this.$entityName ])
            )
            : this.getIndexStorage('id');

        for (let i = 0; i < entitiesId.length; i++) {
            let entity;
            try {
                entity = this.findEntity(entitiesId[ i ], undefined, undefined, onlyInCache);

                if (!entity) {
                    continue;
                }
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
    }

    remove(data, fireEvents) {
        let entity, id;

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

        console.log('Deleting ' + this.$entityName + ' #' + id);

        if (this.removeIndex('id', id)) {
            // console.log(entity);

            let entityDefinition = this.getEntityDefinition();

            for (let fieldName in entityDefinition.indexes) {
                if (fieldName !== 'id') {
                    this.removeIndex(
                        fieldName,
                        entityDefinition.indexes[ fieldName ].getIndex(entity),
                        id,
                    );
                }
            }

            this.$manager.$storage.unset(
                this.$manager.$storage.key(
                    [ this.getStorageKeyName(), id ],
                ),
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

        return this;
    }

    /**
     * Remove collection of objects | object identifiers
     */
    removeCollection(collection, fireEvents) {
        console.log('Remove collection');

        for (let i = 0; i < collection.length; i++) {
            try {
                let item = collection[ i ];

                this.remove(
                    item,
                    fireEvents,
                );

                if (collection.indexOf(item) === -1) {
                    i--;
                }
            } catch (e) {
            }
        }

        return this;
    }

    removeDeleted(
        collection, previousIds, fireEvents) {
        if (previousIds.length > 0) {
            console.log('Remove deleted for entity "' + this.$entityName + '"');

            previousIds = this.$manager.clone(previousIds);

            for (let i = 0; i < collection.length; i++) {
                let id = this.$manager.extractIdFromData(collection[ i ]);

                let index = previousIds.indexOf(id);

                if (index !== -1) {
                    previousIds.splice(index, 1);
                }
            }

            if (previousIds.length > 0) {
                this.removeCollection(previousIds, fireEvents);
            } else {
                console.log('Nothing to delete');
            }
        }

        return this;
    }

    removeIndex(fieldName: string, fieldValue: any = undefined, id: Number = undefined) {
        if (fieldValue === undefined || fieldValue === null) {
            return false;
        }

        let index  = this.getIndexStorage(fieldName);
        let indexOf, fieldIndex;
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
    }

    removeIndexesFromCache() {
        let entityDefinition = this.getEntityDefinition();

        for (let indexName in entityDefinition.indexes) {
            this.$manager.deleteFromCache(
                this.$entityName,
                this.$manager.$INDEX_PREFIX + indexName,
            );
        }
    }

    save(entity, fireEvents) {
        let id = entity.getId();

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

        console.log('Saving ' + this.$entityName + ' #' + id);
        // console.log(entity);

        let oldId      = entity.$oldId;
        let changingId = id !== oldId && oldId !== null;

        if (changingId) {
            this.remove(oldId, fireEvents);
        }

        let indexFields;
        if (this.$manager.$useIndex) {
            let entityDefinition = this.getEntityDefinition();

            indexFields = Object.keys(entityDefinition.indexes);
        } else {
            indexFields = [ 'id' ];
        }

        for (let i = 0; i < indexFields.length; i++) {
            let indexField = indexFields[ i ];

            let newValue = entity[ indexField ];
            let oldValue = entity.$oldValues[ indexField ];

            if (newValue !== oldValue || changingId) {
                this.removeIndex(
                    indexField,
                    oldValue,
                    changingId ? oldId : id,
                );

                this.addIndex(
                    indexField,
                    newValue,
                    entity,
                );
            }
        }

        this.$manager.$storage.set(
            this.$manager.$storage.key(
                [ this.getStorageKeyName(), id ],
            ),
            this.getEntityStorageData(entity),
        );

        entity.$oldId     = id;
        entity.$oldValues = this.$manager.clone(entity.$values);

        this.$manager.addToCache(entity);
        if (this.$manager.$useIndex && id !== oldId) {
            this.$manager.resetRelationsCache(entity, oldId);
        }

        if (fireEvents) {
            this.$manager.fireEvents('afterSave', entity);
        }

        console.log(this.$entityName + ' #' + entity.getId() + ' saved');

        return true;
    }

    saveCollection(collection, fireEvents) {
        if (collection.length > 0) {
            console.log('Save collection');

            for (let i = 0; i < collection.length; i++) {
                if (collection[ i ] instanceof Entity && collection[ i ].$repository === this) {
                    this.save(collection[ i ], fireEvents);
                }
            }
        }

        return this;
    }

    saveInMemory(entity) {
        let manager            = this.$manager;
        let originalEntityName = this.$entityName;
        let id;

        for (let entityName in manager.$entityDefinitions) {
            let entityDefinition = manager.$entityDefinitions[ entityName ];

            for (let field in entityDefinition.relations) {
                let relation = entityDefinition.relations[ field ];

                if (relation.entity === originalEntityName && relation.type === 'many') {
                    let getterMethod         = manager.getMethodName('get', relation.referencedField);
                    let relationPluralName   = manager.getRelationName(relation);
                    let relationGetterMethod = manager.getMethodName('get', relationPluralName);

                    for (id in manager.$cache[ entityName ]) {
                        let cachedEntity = manager.$cache[ entityName ][ id ];

                        if (cachedEntity.id === entity[ getterMethod ]()) {
                            if (!manager.hasInCache(entity)) {
                                if (!manager.hasRelationCache(cachedEntity, relation)) {
                                    // load "normal" data before insert memory data in relation cache
                                    cachedEntity[ relationGetterMethod ]();
                                }

                                let relationCache      = manager.getRelationCache(cachedEntity, relation) || [];
                                let isNotCurrentEntity = function (relation) {
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
    }

    setDependencies(oldId, entity) {
        let entityDefinition = this.getEntityDefinition();

        for (let dependencyName in entityDefinition.dependencies) {
            let repository = this.$manager.getRepository(dependencyName);

            for (let field in entityDefinition.dependencies[ dependencyName ]) {
                let dependency = entityDefinition.dependencies[ dependencyName ][ field ];

                let entities = [];
                if (dependency.type === 'one') {
                    entities = repository.findBy(field, oldId);
                } else if (dependency.type === 'many') {
                    if (entityDefinition.fields[ field ]) {
                        entities = repository.query(
                            function (currentEntity) {
                                return currentEntity.get(field).indexOf(oldId) !== -1;
                            },
                        );
                    }
                }

                for (let i = 0; i < entities.length; i++) {
                    console.log(
                        'Update relation ID in entity "' + dependencyName + '" #' + entities[ i ].getId() +
                        ' to entity "' + entity.$repository.$entityName + '" #' + entity.getId(),
                    );
                    if (dependency.type === 'one') {
                        entities[ i ].set(
                            field,
                            entity.getId(),
                        );
                    } else if (dependency.type === 'many') {
                        let data = entities[ i ].get(
                            field,
                        );

                        let index = data.indexOf(oldId);

                        data[ index ] = entity.getId();

                        entities[ i ].set(
                            field,
                            data,
                        );
                    }
                }

                repository.saveCollection(entities);
            }
        }
    }

    setIndexStorage(fieldName, indexStorage) {
        this.$manager.$storage.set(
            this.getIndexStorageKey(fieldName),
            indexStorage,
        );

        this.$manager.addToCache(
            this.$entityName,
            this.$manager.$INDEX_PREFIX + fieldName,
            indexStorage,
        );
    }
}
