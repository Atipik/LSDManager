(function(window) {
    'use strict';

    var Repository = window.Repository = function(manager, entityName) {
        this.$manager    = manager;
        this.$entityName = entityName;
    };

    Repository.prototype.addIndex = Repository.prototype._addIndex = function(indexName, value, entity, indexStorage) {
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
            if (index.indexOf(entity.id) === -1) {
                index.push(entity.id);

                updated = true;
            }
        } else {
            var indexDefinition = this.getEntityDefinition().indexes[ indexName ];

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
    };

    Repository.prototype.createEntity = Repository.prototype._createEntity = function(data, useCache) {
        if (!data) {
            data = {};
        }

        if (useCache === undefined) {
            useCache = true;
        }

        var manager = this.$manager;

        var entity = manager.extend(
            new Entity(this),
            manager.getEntity(this.$entityName)
        );

        Object.defineProperties(
            entity,
            manager.$entityProperties[ this.$entityName ]
        );

        entity.__init__();

        if (data.id === undefined && data._ === undefined) {
            data.id = manager.getNewId();
        }

        entity = this.loadEntity(
            entity,
            data
        );

        if (useCache) {
            manager.addToCache(entity);
        }

        return entity;
    };

    Repository.prototype.createIndexesStorage = Repository.prototype._createIndexesStorage = function(indexNames) {
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
                    entity,
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

    Repository.prototype.removeIndexesFromCache = Repository.prototype._removeIndexesFromCache = function() {
        var entityDefinition = this.getEntityDefinition();

        for (var indexName in entityDefinition.indexes) {
            this.$manager.deleteFromCache(
                this.$entityName,
                this.$INDEX_PREFIX + indexName
            );
        }
    };

    Repository.prototype.findAll = Repository.prototype._findAll = function() {
        return this.query(
            function() {
                return true;
            }
        );
    };

    Repository.prototype.findBy = Repository.prototype._findBy = function(field, value, justOne) {
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

    Repository.prototype.findByCollection = Repository.prototype._findByCollection = function(field, collection) {
        if (collection.length === 0) {
            return [];
        }

        var entityDefinition = this.getEntityDefinition();
        if (entityDefinition.indexes[ field ] !== undefined) {
            var results = [];

            for (var i = 0; i < collection.length; i++) {
                results = results.concat(
                    this.findBy(field, collection[i])
                );
            }

            return results;
        } else {
            return this.query(
                function(entity) {
                    return collection.indexOf(entity[ field ]) !== -1;
                }
            );
        }
    };

    Repository.prototype.findEntity = Repository.prototype._findEntity = function(id, entityName, useCache) {
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
                useCache
            );

            entity.$oldId     = entity.id;
            entity.$oldValues = this.$manager.clone(entity.$values);

            if (useCache) {
                this.$manager.addToCache(entity);
            }

            return entity;
        }

        return this.$manager.getFromCache(entityName, id);
    };

    Repository.prototype.findOneBy = Repository.prototype._findOneBy = function(field, value) {
        var entities = this.findBy(field, value, true);

        if (entities.length > 0) {
            return entities[ 0 ];
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

    Repository.prototype.getStorageKeyName = Repository.prototype._getStorageKeyName = function(entityName) {
        if (entityName === undefined) {
            entityName = this.$entityName;
        }

        return this.$manager.$useShortcut ? (this.$manager.getEntityDefinition(entityName).shortcut || entityName) : entityName;
    };

    Repository.prototype.getIndexStorageKey = Repository.prototype._getIndexStorageKey = function(fieldName) {
        return this.$manager.$storage.key(
            [
                this.getStorageKeyName(),
                this.$manager.$INDEX_PREFIX + (
                    this.$manager.$useShortcut ? this.getEntityDefinition().indexes[ fieldName ].shortcut : fieldName
                )
            ]
        );
    };

    Repository.prototype.getIndexStorage = Repository.prototype._getIndexStorage = function(indexName) {
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

    Repository.prototype.__init__ = function() {
    };

    Repository.prototype.isValid = Repository.prototype._isValid = function(entity) {
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

    Repository.prototype.loadEntity = Repository.prototype._loadEntity = function(entity, data) {
        var field, methodSet;

        var shortcuts = this.getEntityDefinition().shortcuts;

        for (field in data) {
            var value = data[ field ];

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
    };

    Repository.prototype.query = Repository.prototype._query = function(filter) {
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

    Repository.prototype.remove = Repository.prototype._remove = function(data, fireEvents) {
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

        console.log('Deleting ' + this.$entityName + ' #' + id);

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

        return this;
    };

    /**
     * Remove collection of objects | object identifiers
     */
    Repository.prototype.removeCollection = Repository.prototype._removeCollection = function(collection, fireEvents) {
        console.log('Remove collection');

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

        return this;
    };

    Repository.prototype.removeDeleted = Repository.prototype._removeDeleted = function(collection, previousIds, fireEvents) {
        if (previousIds.length > 0) {
            console.log('Remove deleted for entity "' + this.$entityName + '"');

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
        }

        return this;
    };

    Repository.prototype.removeIndex = Repository.prototype._removeIndex = function(fieldName, fieldValue, id) {
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

    Repository.prototype.save = Repository.prototype._save = function(entity, fireEvents) {
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

        console.log('Saving ' + this.$entityName + ' #' + id);
        // console.log(entity);

        var oldId = entity.$oldId;
        var changingId = id !== oldId && oldId !== null;

        if (changingId) {
            this.remove(oldId, fireEvents);
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
                    changingId ? oldId : id
                );

                this.addIndex(
                    indexField,
                    newValue,
                    entity
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
        if (this.$manager.$useIndex && changingId) {
            this.$manager.resetRelationsCache(entity, oldId);
        }

        if (fireEvents) {
            this.$manager.fireEvents('afterSave', entity);
        }

        console.log(this.$entityName + ' #' + entity.getId() + ' saved');

        return true;
    };

    Repository.prototype.saveCollection = Repository.prototype._saveCollection = function(collection, fireEvents) {
        if (collection.length > 0) {
            console.log('Save collection');

            for (var i = 0; i < collection.length; i++) {
                if (collection[ i ] instanceof Entity && collection[ i ].$repository === this) {
                    this.save(collection[ i ], fireEvents);
                }
            }
        }

        return this;
    };

    Repository.prototype.saveInMemory = Repository.prototype._saveInMemory = function(entity) {
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

    Repository.prototype.setDependencies = Repository.prototype._setDependencies = function(oldId, entity) {
        var entityDefinition = this.getEntityDefinition();

        for (var dependencyName in entityDefinition.dependencies) {
            var repository = this.$manager.getRepository(dependencyName);

            for (var field in entityDefinition.dependencies[ dependencyName ]) {
                var dependency = entityDefinition.dependencies[ dependencyName ][ field ];

                var entities = [];
                if (dependency.type === 'one') {
                    entities = repository.findBy(field, oldId);
                } else if (dependency.type === 'many') {
                    if (entityDefinition.fields[ field ]) {
                        entities = repository.query(
                            function(currentEntity) {
                                return currentEntity.get(field).indexOf(oldId) !== -1;
                            }
                        );
                    }
                }

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

                repository.saveCollection(entities);
            }
        }
    };

    Repository.prototype.setIndexStorage = Repository.prototype._setIndexStorage = function(fieldName, indexStorage) {
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
}(window));
