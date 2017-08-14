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
