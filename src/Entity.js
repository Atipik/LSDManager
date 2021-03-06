(function(window) {
    'use strict';

    var Entity = window.Entity = function(repository) {
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
            this.$toArray(),
            false   /* no cache */
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

            if (this.$manager.checkType(oldValue, 'object')) {
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
        return this.$repository.loadEntity(this, data);
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
