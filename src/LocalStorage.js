(function(window) {
    'use strict';

    var LocalStorage = window.LocalStorage = function(prefix) {
        if (prefix) {
            this.$prefix = prefix;
        } else {
            this.$prefix = 'storage';
        }

        this.$separator = '.';
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
}(window));
