/// <reference path="./Repository.ts" />
class Entity {
    constructor($repository) {
        this.$repository = $repository;
        this.$oldId = null;
        this.$oldValues = {};
        this.$relationsCache = {};
        this.$values = {};
        this.$manager = $repository.$manager;
    }
    $clone() {
        let clone = this.$repository.createEntity(this.$toArray(), false);
        if (clone.id > 0) {
            clone.$oldId = clone.id;
        }
        clone.$oldValues = this.$manager.clone(this.$oldValues);
        return clone;
    }
    $isModified(deeply = undefined) {
        if (this.$isNew()) {
            return true;
        }
        let fields = this.$repository.getEntityDefinition().fields;
        for (let field in fields) {
            let oldValue = this.$oldValues[field] === undefined ? null : this.$oldValues[field];
            let value = this.$values[field] === undefined ? null : this.$values[field];
            if (this.$manager.getType(oldValue) !== this.$manager.getType(value)) {
                return true;
            }
            if (this.$manager.checkType(oldValue, 'object')) {
                if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
                    return true;
                }
            }
            else {
                if (oldValue !== value) {
                    return true;
                }
            }
        }
        if (deeply) {
            let objects = [];
            let hasModifiedChildren = function (entity) {
                objects.push(entity);
                let repository = entity.$repository;
                let manager = entity.$manager;
                let relations = repository.getEntityDefinition().relations;
                for (let relationField in relations) {
                    let relation = relations[relationField];
                    let relationName = manager.getRelationName(relation);
                    if (entity.$relationsCache[relationName]) {
                        let relationData = entity.$relationsCache[relationName];
                        if (relation.type === 'one') {
                            relationData = [relationData];
                        }
                        for (let i = 0; i < relationData.length; i++) {
                            let relationDataItem = relationData[i];
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
    }
    $isNew() {
        return this.$oldId === null;
    }
    $load(data) {
        return this.$repository.loadEntity(this, data);
    }
    $remove(fireEvents) {
        return this.$repository.remove(this, fireEvents);
    }
    $reset() {
        this.$values = this.$manager.clone(this.$oldValues);
        this.$relationsCache = {};
    }
    $save(fireEvents) {
        return this.$repository.save(this, fireEvents);
    }
    $saveInMemory() {
        return this.$repository.saveInMemory(this);
    }
    $toArray(useShortCut = undefined) {
        return this.$manager.extend({
            _entityName: this.$repository.$entityName,
        }, this.$repository.getEntityStorageData(this, !!useShortCut, false));
    }
    __init__() {
    }
    get(field) {
        return this.$manager.fixValueType(this.$values[field], this.$repository.getEntityDefinition().fields[field].type);
    }
    set(field, value) {
        let entityDefinition = this.$repository.getEntityDefinition();
        let oldValue = this.$values[field];
        if (oldValue !== value) {
            this.$values[field] = this.$manager.fixValueType(value, entityDefinition.fields[field].type);
            if (entityDefinition.relations[field]) {
                this.$manager.removeRelationCache(this, entityDefinition.relations[field]);
            }
        }
        return this;
    }
}
/// <reference path="./Entity.ts" />
class Repository {
    constructor($manager, $entityName) {
        this.$manager = $manager;
        this.$entityName = $entityName;
    }
    __init__() {
    }
    addIndex(indexName, value = undefined, entity = undefined, indexStorage = undefined) {
        if (value === undefined || value === null) {
            return false;
        }
        let index;
        if (indexStorage) {
            index = indexStorage;
        }
        else {
            index = this.getIndexStorage(indexName);
        }
        let updated = false;
        if (indexName === 'id') {
            if (index.indexOf(entity.id) === -1) {
                index.push(entity.id);
                updated = true;
            }
        }
        else {
            let indexDefinition = this.getEntityDefinition().indexes[indexName];
            if (indexDefinition.isIndexable(entity)) {
                value = indexDefinition.transformIndex(value);
                if (index[value] === undefined) {
                    index[value] = [];
                }
                if (index[value].indexOf(entity.id) === -1) {
                    index[value].push(entity.id);
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
        }
        else {
            entity = manager.extend(new Entity(this), entityClass);
        }
        Object.defineProperties(entity, manager.$entityProperties[this.$entityName]);
        entity.__init__();
        if (data.id === undefined && data._ === undefined) {
            data.id = manager.getNewId();
        }
        entity = this.loadEntity(entity, data);
        if (useCache) {
            manager.addToCache(entity);
        }
        return entity;
    }
    createIndexesStorage(indexNames) {
        let entitiesId = this.getIndexStorage('id');
        let returnOne = false;
        if (!(indexNames instanceof Array)) {
            returnOne = true;
            indexNames = [indexNames];
        }
        let indexes = {};
        for (let i = 0; i < indexNames.length; i++) {
            indexes[indexNames[i]] = {};
        }
        let indexesDefinitions = this.getEntityDefinition().indexes;
        for (let i = 0; i < entitiesId.length; i++) {
            let entity;
            try {
                entity = this.findEntity(entitiesId[i]);
            }
            catch (e) {
                entitiesId.splice(i, 1);
                this.setIndexStorage('id', entitiesId);
                i--;
                continue;
            }
            for (let j = 0; j < indexNames.length; j++) {
                let indexName = indexNames[j];
                this.addIndex(indexName, indexesDefinitions[indexName].getIndex(entity), entity, indexes[indexName]);
            }
        }
        if (returnOne) {
            return indexes[indexNames[0]];
        }
        else {
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
        if (entityDefinition.indexes[field] !== undefined) {
            let index = this.getIndexStorage(field);
            let indexValue = entityDefinition.indexes[field].transformIndex(value);
            if (justOne) {
                let result = [];
                if (index[indexValue] && index[indexValue][0]) {
                    let entity = this.findEntity(index[indexValue][0], undefined, undefined, onlyInCache);
                    if (entity) {
                        result.push(entity);
                    }
                }
                return result;
            }
            else {
                let entities = [];
                if (index[indexValue]) {
                    for (let i = 0; i < index[indexValue].length; i++) {
                        let entity = this.findEntity(index[indexValue][i], undefined, undefined, onlyInCache);
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
        let entities = this.query(function (entity) {
            return entity[field] === value;
        }, onlyInCache);
        let searchDuration = Date.now() - start;
        if (searchDuration > 500) {
            console.warn('You should add an index on ' + this.$entityName + '.' + field
                + ' (' + searchDuration + 'ms to execute query).');
        }
        if (justOne) {
            if (entities[0]) {
                return [entities[0]];
            }
            else {
                return [];
            }
        }
        else {
            return entities;
        }
    }
    findByCollection(field, collection, ignoreMissing, onlyInCache) {
        if (collection.length === 0) {
            return [];
        }
        let entityDefinition = this.getEntityDefinition();
        if (entityDefinition.indexes[field] !== undefined) {
            let results = [];
            for (let i = 0; i < collection.length; i++) {
                try {
                    let result = this.findBy(field, collection[i], undefined, onlyInCache);
                    results = results.concat(result);
                }
                catch (e) {
                    if (!ignoreMissing) {
                        throw e;
                    }
                }
            }
            return results;
        }
        else {
            return this.query(function (entity) {
                return collection.indexOf(entity[field]) !== -1;
            }, onlyInCache);
        }
    }
    findEntity(id, entityName = undefined, useCache = undefined, onlyInCache = undefined) {
        if (!entityName) {
            entityName = this.$entityName;
        }
        if (useCache === undefined) {
            useCache = true;
        }
        let hasInCache = this.$manager.hasInCache(entityName, id);
        if ((!useCache || !hasInCache) && !onlyInCache) {
            let entityKey = this.$manager.$storage.key([this.getStorageKeyName(entityName), id]);
            if (!this.$manager.$storage.has(entityKey)) {
                throw new Error('Unknown entity ' + this.$entityName + ' with storage key ' + entityKey);
            }
            let entity = this.createEntity(this.getFullData(this.$manager.$storage.get(entityKey)), useCache);
            entity.$oldId = entity.id;
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
            return entities[0];
        }
        return null;
    }
    getEntityDefinition() {
        return this.$manager.getEntityDefinition(this.$entityName);
    }
    getEntityStorageData(entity, useShortCut = undefined, removeNull = undefined) {
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
                let dataKey = useShortCut ? (this.getEntityDefinition().fields[field].shortcut || field) : field;
                if (this.$manager.checkType(entity[storageMethod], 'function')) {
                    data[dataKey] = entity[storageMethod]();
                }
                else {
                    data[dataKey] = entity[this.$manager.getMethodName('get', field)]();
                }
                if (removeNull && data[dataKey] === null) {
                    delete data[dataKey];
                }
            }
        }
        return data;
    }
    getFullData(data) {
        let fields = this.getEntityDefinition().fields;
        for (let field in fields) {
            let fieldConf = fields[field];
            if (data[field] === undefined
                && fieldConf.shortcut !== undefined && data[fieldConf.shortcut] === undefined) {
                data[field] = null;
            }
        }
        return data;
    }
    getIndexStorage(indexName) {
        let entityName = this.$entityName;
        let cacheName = this.$manager.$INDEX_PREFIX + indexName;
        if (!this.$manager.hasInCache(entityName, cacheName)) {
            let indexStorage = this.$manager.$storage.get(this.getIndexStorageKey(indexName), indexName === 'id' ? [] : null);
            if (indexStorage === null) {
                if (this.getIndexStorage('id').length === 0) {
                    indexStorage = {};
                }
                else {
                    indexStorage = this.createIndexesStorage(indexName);
                }
                this.setIndexStorage(indexName, indexStorage);
            }
            else {
                this.$manager.addToCache(entityName, cacheName, indexStorage);
            }
            return indexStorage;
        }
        return this.$manager.getFromCache(entityName, cacheName);
    }
    getIndexStorageKey(fieldName) {
        return this.$manager.$storage.key([
            this.getStorageKeyName(),
            this.$manager.$INDEX_PREFIX + (this.$manager.$useShortcut ? this.getEntityDefinition().indexes[fieldName].shortcut : fieldName),
        ]);
    }
    getStorageKeyName(entityName = undefined) {
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
            if (fields[fieldName].nullable === false
                && entity.get(fieldName) === null) {
                return false;
            }
        }
        let relations = entityDefinition.relations;
        for (let fieldName in relations) {
            let relation = relations[fieldName];
            if (relation.referencedField === undefined) {
                let data = entity.get(fieldName);
                if (relation.type === 'one') {
                    if (data < 0) {
                        return false;
                    }
                }
                else if (relation.type === 'many') {
                    for (let i = 0; i < data.length; i++) {
                        if (data[i] < 0) {
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
            let value = data[field];
            field = shortcuts[field] || field;
            methodSet = this.$manager.getMethodName('set', field, 'FromStorage');
            if (!entity[methodSet] || !this.$manager.checkType(entity[methodSet], 'function')) {
                methodSet = this.$manager.getMethodName('set', field);
                if (!entity[methodSet] || !this.$manager.checkType(entity[methodSet], 'function')) {
                    continue;
                }
            }
            entity[methodSet](value);
        }
        return entity;
    }
    query(filter, onlyInCache = undefined) {
        let entities = [];
        let entitiesId = onlyInCache
            ? (this.$manager.$cache[this.$entityName] === undefined
                ? []
                : Object.keys(this.$manager.$cache[this.$entityName]))
            : this.getIndexStorage('id');
        for (let i = 0; i < entitiesId.length; i++) {
            let entity;
            try {
                entity = this.findEntity(entitiesId[i], undefined, undefined, onlyInCache);
                if (!entity) {
                    continue;
                }
            }
            catch (e) {
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
            id = entity.getId();
        }
        else {
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
                    this.removeIndex(fieldName, entityDefinition.indexes[fieldName].getIndex(entity), id);
                }
            }
            this.$manager.$storage.unset(this.$manager.$storage.key([this.getStorageKeyName(), id]));
            this.$manager.deleteFromCache(this.$entityName, id);
            this.$manager.resetRelationsCache(entity);
            if (fireEvents) {
                this.$manager.fireEvents('afterRemove', entity);
            }
            console.log(this.$entityName + ' #' + id + ' deleted');
        }
        else {
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
                let item = collection[i];
                this.remove(item, fireEvents);
                if (collection.indexOf(item) === -1) {
                    i--;
                }
            }
            catch (e) {
            }
        }
        return this;
    }
    removeDeleted(collection, previousIds, fireEvents) {
        if (previousIds.length > 0) {
            console.log('Remove deleted for entity "' + this.$entityName + '"');
            previousIds = this.$manager.clone(previousIds);
            for (let i = 0; i < collection.length; i++) {
                let id = this.$manager.extractIdFromData(collection[i]);
                let index = previousIds.indexOf(id);
                if (index !== -1) {
                    previousIds.splice(index, 1);
                }
            }
            if (previousIds.length > 0) {
                this.removeCollection(previousIds, fireEvents);
            }
            else {
                console.log('Nothing to delete');
            }
        }
        return this;
    }
    removeIndex(fieldName, fieldValue = undefined, id = undefined) {
        if (fieldValue === undefined || fieldValue === null) {
            return false;
        }
        let index = this.getIndexStorage(fieldName);
        let indexOf, fieldIndex;
        fieldValue = this.getEntityDefinition().indexes[fieldName].transformIndex(fieldValue);
        if (fieldName === 'id') {
            fieldIndex = index;
            indexOf = index.indexOf(fieldValue);
        }
        else {
            fieldIndex = index[fieldValue];
            indexOf = fieldIndex ? fieldIndex.indexOf(id) : -1;
        }
        if (indexOf !== -1) {
            fieldIndex.splice(indexOf, 1);
            if (fieldName !== 'id' && fieldIndex.length === 0) {
                delete index[fieldValue];
            }
            this.setIndexStorage(fieldName, index);
            return true;
        }
        return false;
    }
    removeIndexesFromCache() {
        let entityDefinition = this.getEntityDefinition();
        for (let indexName in entityDefinition.indexes) {
            this.$manager.deleteFromCache(this.$entityName, this.$manager.$INDEX_PREFIX + indexName);
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
        let oldId = entity.$oldId;
        let changingId = id !== oldId && oldId !== null;
        if (changingId) {
            this.remove(oldId, fireEvents);
        }
        let indexFields;
        if (this.$manager.$useIndex) {
            let entityDefinition = this.getEntityDefinition();
            indexFields = Object.keys(entityDefinition.indexes);
        }
        else {
            indexFields = ['id'];
        }
        for (let i = 0; i < indexFields.length; i++) {
            let indexField = indexFields[i];
            let newValue = entity[indexField];
            let oldValue = entity.$oldValues[indexField];
            if (newValue !== oldValue || changingId) {
                this.removeIndex(indexField, oldValue, changingId ? oldId : id);
                this.addIndex(indexField, newValue, entity);
            }
        }
        this.$manager.$storage.set(this.$manager.$storage.key([this.getStorageKeyName(), id]), this.getEntityStorageData(entity));
        entity.$oldId = id;
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
                if (collection[i] instanceof Entity && collection[i].$repository === this) {
                    this.save(collection[i], fireEvents);
                }
            }
        }
        return this;
    }
    saveInMemory(entity) {
        let manager = this.$manager;
        let originalEntityName = this.$entityName;
        let id;
        for (let entityName in manager.$entityDefinitions) {
            let entityDefinition = manager.$entityDefinitions[entityName];
            for (let field in entityDefinition.relations) {
                let relation = entityDefinition.relations[field];
                if (relation.entity === originalEntityName && relation.type === 'many') {
                    let getterMethod = manager.getMethodName('get', relation.referencedField);
                    let relationPluralName = manager.getRelationName(relation);
                    let relationGetterMethod = manager.getMethodName('get', relationPluralName);
                    for (id in manager.$cache[entityName]) {
                        let cachedEntity = manager.$cache[entityName][id];
                        if (cachedEntity.id === entity[getterMethod]()) {
                            if (!manager.hasInCache(entity)) {
                                if (!manager.hasRelationCache(cachedEntity, relation)) {
                                    // load "normal" data before insert memory data in relation cache
                                    cachedEntity[relationGetterMethod]();
                                }
                                let relationCache = manager.getRelationCache(cachedEntity, relation) || [];
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
        entity.$oldId = id;
        entity.$oldValues = manager.clone(entity.$values);
        manager.addToCache(entity);
    }
    setDependencies(oldId, entity) {
        let entityDefinition = this.getEntityDefinition();
        for (let dependencyName in entityDefinition.dependencies) {
            let repository = this.$manager.getRepository(dependencyName);
            for (let field in entityDefinition.dependencies[dependencyName]) {
                let dependency = entityDefinition.dependencies[dependencyName][field];
                let entities = [];
                if (dependency.type === 'one') {
                    entities = repository.findBy(field, oldId);
                }
                else if (dependency.type === 'many') {
                    if (entityDefinition.fields[field]) {
                        entities = repository.query(function (currentEntity) {
                            return currentEntity.get(field).indexOf(oldId) !== -1;
                        });
                    }
                }
                for (let i = 0; i < entities.length; i++) {
                    console.log('Update relation ID in entity "' + dependencyName + '" #' + entities[i].getId() +
                        ' to entity "' + entity.$repository.$entityName + '" #' + entity.getId());
                    if (dependency.type === 'one') {
                        entities[i].set(field, entity.getId());
                    }
                    else if (dependency.type === 'many') {
                        let data = entities[i].get(field);
                        let index = data.indexOf(oldId);
                        data[index] = entity.getId();
                        entities[i].set(field, data);
                    }
                }
                repository.saveCollection(entities);
            }
        }
    }
    setIndexStorage(fieldName, indexStorage) {
        this.$manager.$storage.set(this.getIndexStorageKey(fieldName), indexStorage);
        this.$manager.addToCache(this.$entityName, this.$manager.$INDEX_PREFIX + fieldName, indexStorage);
    }
}
class LocalStorage {
    /**
     * Constructor
     *
     * @param prefix
     */
    constructor(prefix) {
        this.$prefix = 'storage';
        this.$separator = '.';
        if (prefix) {
            this.$prefix = prefix;
        }
    }
    /**
     * Get data by key
     *
     * @param key
     * @param defaultValue
     */
    get(key, defaultValue = undefined) {
        let value = localStorage.getItem(this.key([this.$prefix, key]));
        if (value === null) {
            if (defaultValue !== undefined) {
                value = defaultValue;
            }
        }
        else {
            value = JSON.parse(value);
        }
        return value;
    }
    /**
     * Check if data exist at key
     *
     * @param key
     */
    has(key) {
        return this.get(key) !== null;
    }
    /**
     * Build key from array
     *
     * @param parts
     */
    key(parts) {
        return parts.join(this.$separator);
    }
    /**
     * Set value of key
     *
     * @param key
     * @param value
     */
    set(key, value) {
        localStorage.setItem(this.key([this.$prefix, key]), JSON.stringify(value));
        return this;
    }
    /**
     * Remove data at key
     *
     * @param key
     */
    unset(key) {
        localStorage.removeItem(this.key([this.$prefix, key]));
        return this;
    }
}
/// <reference path="./Entity.ts" />
/// <reference path="./EntityRelation.ts" />
/// <reference path="./LocalStorage.ts" />
/// <reference path="./Repository.ts" />
class LSDManager {
    constructor(injectStorage = null) {
        this.$INDEX_PREFIX = '$';
        this.$databaseVersion = null;
        this.$entity = {};
        this.$entityClasses = {};
        this.$entityDefinitions = {};
        this.$entityProperties = {};
        this.$eventId = 0;
        this.$events = {};
        this.$lastId = 0;
        this.$repositories = {};
        this.$repositoryClasses = {};
        this.$useIndex = true;
        this.$useShortcut = true;
        this.$cache = {};
        if (injectStorage) {
            this.$storage = injectStorage;
        }
        else {
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
    addToCache(arg1, id = undefined, value = undefined) {
        let entityName;
        if (!id && !value && arg1 instanceof Entity) {
            id = arg1.id;
            value = arg1;
            entityName = arg1.$repository.$entityName;
        }
        else {
            entityName = arg1 + '';
        }
        if (this.$cache[entityName] === undefined) {
            this.$cache[entityName] = {};
        }
        this.$cache[entityName][id] = value;
        return this;
    }
    checkType(variable, type) {
        return this.getType(variable) === type;
    }
    clone(object) {
        return this.extend(object instanceof Array ? [] : {}, object);
    }
    deleteCollectionFromCache(collection) {
        for (let i = 0; i < collection.length; i++) {
            this.deleteFromCache(collection[i]);
        }
    }
    deleteFromCache(arg1, entityId = undefined) {
        let entityName;
        if (arg1 instanceof Entity) {
            entityName = arg1.$repository.$entityName;
            if (entityId === undefined) {
                entityId = arg1.id;
            }
        }
        else {
            entityName = arg1;
        }
        if (entityId === undefined && this.hasInCache(entityName)) {
            delete this.$cache[entityName];
        }
        else if (entityId !== undefined && this.hasInCache(entityName, entityId)) {
            delete this.$cache[entityName][entityId];
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
                if (parent[property] instanceof Array) {
                    child[property] = this.extend([], parent[property]);
                }
                else {
                    child[property] = parent[property];
                }
            }
        }
        return child;
    }
    extractIdFromData(data) {
        if (data instanceof Entity) {
            return data.id;
        }
        else if (this.getType(data) === 'object') {
            if (data.id !== undefined) {
                return data.id;
            }
        }
        else {
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
            data = [data];
        }
        let results = [];
        for (let i = 0; i < data.length; i++) {
            if (filter(data[i])) {
                results.push(data[i]);
            }
        }
        return isArray ? results : results[0];
    }
    fireEvents(eventName, entity) {
        if (this.$events[eventName] !== undefined) {
            console.log(Object.keys(this.$events[eventName]).length + ' callback(s) for event ' + eventName);
            for (let i in this.$events[eventName]) {
                this.$events[eventName][i](entity);
            }
        }
        return this;
    }
    fixValueType(value, type) {
        if (type === undefined || value === null || value === undefined) {
            value = null;
        }
        else if (!this.checkType(value, type)) {
            let tmp, i;
            let valueType = this.getType(value);
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
                    }
                    else {
                        value = [value];
                    }
                    break;
                case 'boolean':
                    if (value === 'false' ||
                        (valueType === 'array' && value.length === 0) ||
                        (valueType === 'object' && Object.keys(value).length === 0)) {
                        value = false;
                    }
                    else {
                        value = !!value;
                    }
                    break;
                case 'float':
                case 'integer':
                    if (valueType === 'boolean') {
                        if (value) {
                            value = 1;
                        }
                        else {
                            value = 0;
                        }
                    }
                    else if (valueType === 'number' && type === 'integer') {
                        value = Math.round(value);
                    }
                    else if (valueType === 'array') {
                        value = value.length;
                    }
                    else {
                        if (type === 'integer') {
                            value = parseInt(value, 10);
                        }
                        else {
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
                    }
                    else if (valueType !== 'object') {
                        value = {
                            0: value,
                        };
                    }
                    break;
                case 'string':
                    if (valueType === 'array' || valueType === 'object') {
                        value = JSON.stringify(value);
                    }
                    else {
                        value = String(value);
                    }
                    break;
                case 'date':
                    if (value === '') {
                        value = null;
                    }
                    else {
                        if (!(value instanceof Date)) {
                            value = new Date(value);
                        }
                        // current date is an invalid date
                        if (isNaN(value.getTime())) {
                            value = null;
                        }
                        else {
                            value.setHours(0, 0, 0, 0);
                        }
                    }
                    break;
                case 'datetime':
                    if (value === '') {
                        value = null;
                    }
                    else {
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
        if (!this.$entity[entityName]) {
            let manager = this;
            let getPropertyGetter = function (field) {
                return function () {
                    return this[manager.getMethodName('get', field)]();
                };
            };
            let getPropertySetter = function (field) {
                return function (value) {
                    return this[manager.getMethodName('set', field)](value);
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
            let strpad = function (input, padLength = undefined) {
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
                        }
                        else if (this.$manager.checkType(value, 'string')) {
                            date = new Date();
                            let parts = value.split(/[\sT]/);
                            let dateParts = parts[0].split('-');
                            date.setFullYear(dateParts[0], dateParts[1] - 1, dateParts[2]);
                            let timeParts = parts[1].split(':');
                            date.setHours(timeParts[0], timeParts[1], timeParts[2], 0);
                        }
                        return this.set(field, date);
                    };
                }
            };
            let entityClass = this.getEntityClass(entityName);
            if (this.isClass(entityClass)) {
                this.$entity[entityName] = entityClass;
                entityClass = entityClass.prototype;
            }
            else {
                entityClass = this.clone(this.getEntityClass(entityName));
                this.$entity[entityName] = entityClass;
            }
            let field, method;
            let properties = {};
            for (field in this.getEntityDefinition(entityName).fields) {
                if (this.getEntityDefinition(entityName).fields.hasOwnProperty(field)) {
                    properties[field] = {
                        get: getPropertyGetter(field),
                        set: getPropertySetter(field),
                    };
                    method = this.getMethodName('get', field);
                    if (entityClass[method] === undefined) {
                        entityClass[method] = getGetter(field);
                    }
                    method = this.getMethodName('set', field);
                    if (entityClass[method] === undefined) {
                        entityClass[method] = getSetter(field);
                    }
                    method = this.getMethodName('get', field, 'ForStorage');
                    if (entityClass[method] === undefined) {
                        let getter = getGetterForStorage(field, this.getEntityDefinition(entityName).fields[field].type);
                        if (getter) {
                            entityClass[method] = getter;
                        }
                    }
                    method = this.getMethodName('set', field, 'FromStorage');
                    if (entityClass[method] === undefined) {
                        let setter = getSetterFromStorage(field, this.getEntityDefinition(entityName).fields[field].type);
                        if (setter) {
                            entityClass[method] = setter;
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
                                    data = repository.findBy(relation.referencedField, this.get('id'));
                                }
                                else {
                                    data = repository.findByCollection('id', this.get(relationField));
                                }
                            }
                            catch (e) {
                                data = undefined;
                            }
                        }
                        else {
                            try {
                                if (relation.referencedField) {
                                    data = repository.findOneBy(relation.referencedField, this.get('id'));
                                }
                                else {
                                    data = repository.findOneBy('id', this.get(relationField));
                                }
                            }
                            catch (e) {
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
                    if (valueRelations[relationName].entity === entity.$repository.$entityName) {
                        valueRelation = valueRelations[relationName];
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
                    if (value[getterMethod] !== undefined && value[getterMethod]() !== entity) {
                        let setterMethod = manager.getMethodName('set', valueRelationName);
                        value[setterMethod](entity);
                    }
                }
                else {
                    getterMethod = manager.getMethodName('get', valueRelationName);
                    if (value[getterMethod] !== undefined) {
                        let entities = value[getterMethod]();
                        if (!entities || entities.indexOf(entity) === -1) {
                            valueRelationName = manager.getRelationName(valueRelation, false);
                            let adderMethod = manager.getMethodName('add', valueRelationName);
                            value[adderMethod](entity);
                        }
                    }
                }
            };
            let getRelationSetter = function (relationField, relation) {
                let setterMethod = manager.getMethodName('set', relation.referencedField || relationField);
                return function (value) {
                    if (value instanceof Entity) {
                        if (this[setterMethod] !== undefined) {
                            this[setterMethod](value.id);
                        }
                        manager.setRelationCache(this, relation, value);
                        addCurrentToRelation(this, value);
                    }
                    else {
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
                        relationCache = this[manager.lowerCaseFirstLetter(manager.getRelationName(relation))];
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
                    return this[manager.getMethodName('get', relationName)]();
                };
            };
            let getPropertyRelationSetter = function (relationName) {
                return function (value) {
                    return this[manager.getMethodName('set', relationName)](value);
                };
            };
            for (field in this.getEntityDefinition(entityName).relations) {
                if (this.getEntityDefinition(entityName).relations.hasOwnProperty(field)) {
                    let relation = this.getEntityDefinition(entityName).relations[field];
                    let relationPluralName = this.getRelationName(relation);
                    let relationSingularName = this.getRelationName(relation, false);
                    properties[this.lowerCaseFirstLetter(relationPluralName)] = {
                        get: getPropertyRelationGetter(relationPluralName),
                        set: getPropertyRelationSetter(relationPluralName),
                    };
                    let getterMethod = this.getMethodName('get', relationPluralName);
                    let getter = getRelationGetter(field, relation);
                    if (entityClass['_' + getterMethod] === undefined) {
                        entityClass['_' + getterMethod] = getter;
                    }
                    if (entityClass[getterMethod] === undefined) {
                        entityClass[getterMethod] = getter;
                    }
                    let setterMethod = this.getMethodName('set', relationPluralName);
                    let setter = getRelationSetter(field, relation);
                    if (entityClass['_' + setterMethod] === undefined) {
                        entityClass['_' + setterMethod] = setter;
                    }
                    if (entityClass[setterMethod] === undefined) {
                        entityClass[setterMethod] = setter;
                    }
                    if (relation.type === 'many') {
                        let adderMethod = this.getMethodName('add', relationSingularName);
                        let adder = getRelationAdder(field, relation);
                        if (entityClass['_' + adderMethod] === undefined) {
                            entityClass['_' + adderMethod] = adder;
                        }
                        if (entityClass[adderMethod] === undefined) {
                            entityClass[adderMethod] = adder;
                        }
                    }
                }
            }
            this.$entityProperties[entityName] = properties;
        }
        return this.$entity[entityName];
    }
    getEntityClass(entityName) {
        if (this.$entityClasses[entityName]) {
            return this.$entityClasses[entityName];
        }
        return {};
    }
    getEntityDefinition(entityName) {
        if (this.$entityDefinitions[entityName]) {
            return this.$entityDefinitions[entityName];
        }
        return {};
    }
    getFromCache(entityName, entityId) {
        if (this.hasInCache(entityName, entityId)) {
            return this.$cache[entityName][entityId];
        }
        return null;
    }
    getMethodName(prefix, field, suffix = undefined) {
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
        return entity.$relationsCache[this.getRelationName(relation)];
    }
    getRelationName(relation, pluralize = undefined) {
        pluralize = pluralize === undefined ? true : pluralize;
        let name = relation.name || relation.entity;
        if (pluralize && relation.type === 'many') {
            if (name.substr(-1) === 'y') {
                name = name.substr(0, name.length - 1) + 'ies';
            }
            else {
                name += 's';
            }
        }
        return name;
    }
    getRepositories() {
        let repositories = [];
        for (let entityName in this.$entityDefinitions) {
            repositories.push(this.getRepository(entityName));
        }
        return repositories;
    }
    getRepository(entityName) {
        if (!this.isValidEntity(entityName)) {
            throw new Error('Unknown repository for ' + entityName);
        }
        else {
            if (!this.$repositories[entityName]) {
                let repositoryClass = this.getRepositoryClass(entityName);
                if (this.isClass(repositoryClass)) {
                    this.$repositories[entityName] = new repositoryClass(this, entityName);
                }
                else {
                    this.$repositories[entityName] = this.extend(new Repository(this, entityName), repositoryClass);
                }
                this.$repositories[entityName].__init__();
            }
            return this.$repositories[entityName];
        }
    }
    getRepositoryClass(entityName) {
        if (this.$repositoryClasses[entityName]) {
            return this.$repositoryClasses[entityName];
        }
        return {};
    }
    getType(o) {
        let TOSTRING = Object.prototype.toString, TYPES = {
            'undefined': 'undefined',
            'number': 'number',
            'boolean': 'boolean',
            'string': 'string',
            '[object Function]': 'function',
            '[object Array]': 'array',
        }, type;
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
    }
    hasInCache(entityName, entityId = undefined) {
        if (entityId === undefined) {
            return this.$cache[entityName] !== undefined;
        }
        return this.$cache[entityName] !== undefined && this.$cache[entityName][entityId] !== undefined;
    }
    hasRelationCache(entity, relation) {
        return entity.$relationsCache[this.getRelationName(relation)] !== undefined;
    }
    isClass(fn) {
        return /^\s*class/.test(fn.toString());
    }
    isValidEntity(entityName) {
        if (this.checkType(this.$entityDefinitions[entityName], 'object')) {
            return true;
        }
        else if (this.checkType(this.$entityClasses[entityName], 'object')) {
            return true;
        }
        else if (this.checkType(this.$repositoryClasses[entityName], 'object')) {
            return true;
        }
        return false;
    }
    lowerCaseFirstLetter(string) {
        return string.charAt(0).toLowerCase() + string.slice(1);
    }
    migrate() {
        let start = new Date().getTime();
        for (let i = 0; i < LSDManager.$migrations.length; i++) {
            LSDManager.$migrations[i](this);
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
        if (this.$events[eventName] === undefined) {
            this.$events[eventName] = {};
        }
        this.$events[eventName][this.$eventId] = callback;
        return this.$eventId++;
    }
    reindexDatabase() {
        console.log('Reindex database');
        for (let entityName in this.$entityDefinitions) {
            let indexFields = Object.keys(this.$entityDefinitions[entityName].indexes);
            if (indexFields.length > 1) {
                indexFields.splice(indexFields.indexOf('id'), 1);
                console.log('Reindex entity "' + entityName + '" for field(s): ' + indexFields.join(', '));
                let repository = this.getRepository(entityName);
                let indexes = repository.createIndexesStorage(indexFields);
                for (let fieldName in indexes) {
                    repository.setIndexStorage(fieldName, indexes[fieldName]);
                }
            }
        }
        console.log('Reindexation finished');
    }
    removeCollection(collection, fireEvents) {
        let collectionByRepository = {};
        for (let i = 0; i < collection.length; i++) {
            let item = collection[i];
            let entityName = item.$repository.$entityName;
            if (collectionByRepository[entityName] === undefined) {
                collectionByRepository[entityName] = [];
            }
            collectionByRepository[entityName].push(item);
        }
        for (let entityName in collectionByRepository) {
            this.getRepository(entityName).removeCollection(collectionByRepository[entityName], fireEvents);
        }
        return this;
    }
    removeRelationCache(entity, relation) {
        delete entity.$relationsCache[this.getRelationName(relation)];
    }
    resetCache() {
        this.$cache = {};
        return this;
    }
    ;
    // old id is not set for remove but set for save
    resetRelationsCache(entity, oldId) {
        let entityEquals = function (e1, e2, oldId) {
            return e1 instanceof Entity
                && e1.$repository.$entityName === e2.$repository.$entityName
                && e1.id === (oldId || e2.id);
        };
        let originalEntityName = entity.$repository.$entityName;
        for (let entityName in this.$entityDefinitions) {
            let entityDefinition = this.$entityDefinitions[entityName];
            for (let field in entityDefinition.relations) {
                let relation = entityDefinition.relations[field];
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
                    }
                    else if (relation.type === 'many') {
                        cachedIds.push(entity[relation.referencedField]);
                        cachedField = 'id';
                    }
                    let repository = this.getRepository(entityName);
                    let cachedEntities = repository.findByCollection(cachedField, cachedIds, undefined, true);
                    for (let i = 0; i < cachedEntities.length; i++) {
                        let cachedEntity = cachedEntities[i];
                        let relationValue;
                        try {
                            relationValue = cachedEntity[getterMethod]();
                        }
                        catch (e) {
                            return;
                        }
                        if (relation.type === 'one') {
                            if (entityEquals(relationValue, entity, oldId)) {
                                // if old is set, replace entity with the new one
                                // else remove it
                                cachedEntity[setterMethod](oldId ? entity : undefined);
                            }
                        }
                        else {
                            if (Array.isArray(relationValue)) {
                                for (let i = 0; i < relationValue.length; i++) {
                                    if (entityEquals(relationValue[i], entity, oldId)) {
                                        if (oldId) {
                                            // if oldId is set, replace entity with the new one
                                            relationValue.splice(i, 1, entity);
                                        }
                                        else {
                                            // else remove it
                                            relationValue.splice(i, 1);
                                        }
                                        break;
                                    }
                                }
                                if (relationValue.length === 0) {
                                    cachedEntity[setterMethod](undefined);
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
        this.$entity[entityName] = compiledEntityClass;
        return this;
    }
    setEntityClass(entityName, entityClass) {
        this.$entityClasses[entityName] = entityClass;
        this.setEntity(entityName, null);
        return this;
    }
    setEntityDefinition(entityName, entityDefinition) {
        if (entityDefinition.fields === undefined) {
            entityDefinition.fields = {};
        }
        entityDefinition.fields.id = {
            type: 'integer',
            shortcut: '_',
            index: true,
        };
        if (entityDefinition.relations === undefined) {
            entityDefinition.relations = {};
        }
        // check entity shortcut
        if (entityDefinition.shortcut) {
            for (let en in this.$entityDefinitions) {
                if (this.$entityDefinitions.hasOwnProperty(en)) {
                    if (en !== entityName && this.$entityDefinitions[en].shortcut === entityDefinition.shortcut) {
                        console.error('Try to add a new entity "' + entityName + '" definition ' +
                            'with shortcut "' + entityDefinition.shortcut + '" ' +
                            'but it already exists in "' + en + '" entity.');
                        return;
                    }
                }
            }
        }
        // check fields shortcuts
        entityDefinition.shortcuts = {};
        for (let field in entityDefinition.fields) {
            if (entityDefinition.fields.hasOwnProperty(field)) {
                let shortcut = entityDefinition.fields[field].shortcut;
                if (shortcut) {
                    if (entityDefinition.shortcuts[shortcut]) {
                        console.error('Try to add a new entity "' + entityName + '" definition ' +
                            'with a field "' + field + '" ' +
                            'with a shortcut "' + shortcut + '" ' +
                            'but it already exists for field "' + entityDefinition.shortcuts[shortcut] + '".');
                        return;
                    }
                    entityDefinition.shortcuts[shortcut] = field;
                }
            }
        }
        // manage indexes
        if (entityDefinition.indexes === undefined) {
            entityDefinition.indexes = {};
        }
        let getStandardIndexGetter = function (field) {
            return function (entity) {
                return entity.get(field) || entity.$oldValues[field];
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
            if (entityDefinition.fields.hasOwnProperty(field) && entityDefinition.fields[field].index !== undefined) {
                entityDefinition.indexes[field] = {
                    shortcut: entityDefinition.fields[field].shortcut || field,
                    getIndex: getStandardIndexGetter(field),
                    isIndexable: entityDefinition.fields[field].index.indexable || getStandardIndexableVerificator(),
                    transformIndex: entityDefinition.fields[field].index.transformer || getStandardIndexTransformer(),
                };
            }
        }
        entityDefinition.dependencies = {};
        this.$entityDefinitions[entityName] = entityDefinition;
        this.setEntity(entityName, null);
        this.updateDependencies();
        return this;
    }
    setRelationCache(entity, relation, value) {
        let relationName = this.getRelationName(relation);
        if (value === undefined) {
            delete entity.$relationsCache[relationName];
        }
        else {
            entity.$relationsCache[relationName] = value;
        }
        return this;
    }
    setRepositoryClass(entityName, repositoryClass) {
        this.$repositoryClasses[entityName] = repositoryClass;
        return this;
    }
    storeDatabaseVersion() {
        this.$storage.set('version', this.$databaseVersion);
    }
    unregisterEvent(eventName, eventId) {
        if (this.$events[eventName] && this.$events[eventName][eventId]) {
            delete this.$events[eventName][eventId];
            if (Object.keys(this.$events[eventName]).length === 0) {
                delete this.$events[eventName];
            }
        }
        return this;
    }
    updateDependencies() {
        for (let entityName in this.$entityDefinitions) {
            let entityDefinition = this.$entityDefinitions[entityName];
            for (let field in entityDefinition.relations) {
                let relation = entityDefinition.relations[field];
                relation.type = relation.type ? relation.type : 'one';
                let relatedEntityDefinition = this.getEntityDefinition(relation.entity);
                if (relatedEntityDefinition.dependencies) {
                    if (relatedEntityDefinition.dependencies[entityName] === undefined) {
                        relatedEntityDefinition.dependencies[entityName] = {};
                    }
                    relatedEntityDefinition.dependencies[entityName][field] = {
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
LSDManager.$migrations = [];
