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
