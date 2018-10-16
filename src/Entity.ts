/// <reference path="./Repository.ts" />

class Entity {
    public $manager;
    public $oldId          = null;
    public $oldValues      = {};
    public $relationsCache = {};
    public $values         = {};

    public id;

    constructor(public $repository: Repository) {
        this.$manager = $repository.$manager;
    }

    $clone() {
        let clone = this.$repository.createEntity(
            this.$toArray(),
            false, /* no cache */
        );

        if (clone.id > 0) {
            clone.$oldId = clone.id;
        }

        clone.$oldValues = this.$manager.clone(this.$oldValues);

        return clone;
    }

    $isModified(deeply: boolean = undefined) {
        if (this.$isNew()) {
            return true;
        }

        let fields = this.$repository.getEntityDefinition().fields;

        for (let field in fields) {
            let oldValue = this.$oldValues[ field ] === undefined ? null : this.$oldValues[ field ];
            let value    = this.$values[ field ] === undefined ? null : this.$values[ field ];

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
            let objects = [];

            let hasModifiedChildren = function (entity) {
                objects.push(entity);

                let repository = entity.$repository;
                let manager    = entity.$manager;
                let relations  = repository.getEntityDefinition().relations;

                for (let relationField in relations) {
                    let relation     = relations[ relationField ];
                    let relationName = manager.getRelationName(relation);

                    if (entity.$relationsCache[ relationName ]) {
                        let relationData = entity.$relationsCache[ relationName ];

                        if (relation.type === 'one') {
                            relationData = [ relationData ];
                        }

                        for (let i = 0; i < relationData.length; i++) {
                            let relationDataItem = relationData[ i ];

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
        this.$values         = this.$manager.clone(this.$oldValues);
        this.$relationsCache = {};
    }

    $save(fireEvents) {
        return this.$repository.save(this, fireEvents);
    }

    $saveInMemory() {
        return this.$repository.saveInMemory(this);
    }

    $toArray(useShortCut: boolean = undefined) {
        return this.$manager.extend(
            {
                _entityName: this.$repository.$entityName,
            },
            this.$repository.getEntityStorageData(this, !!useShortCut, false),
        );
    }

    __init__() {
    }

    get(field) {
        return this.$manager.fixValueType(
            this.$values[ field ],
            this.$repository.getEntityDefinition().fields[ field ].type,
        );
    }

    set(field, value) {
        let entityDefinition = this.$repository.getEntityDefinition();

        let oldValue = this.$values[ field ];

        if (oldValue !== value) {
            this.$values[ field ] = this.$manager.fixValueType(
                value,
                entityDefinition.fields[ field ].type,
            );

            if (entityDefinition.relations[ field ]) {
                this.$manager.removeRelationCache(this, entityDefinition.relations[ field ]);
            }
        }

        return this;
    }
}
