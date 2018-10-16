class LocalStorage {
    public $prefix: string    = 'storage';
    public $separator: string = '.';

    /**
     * Constructor
     *
     * @param prefix
     */
    constructor(prefix: string) {
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
    get(key: string, defaultValue: any = undefined) {
        let value = localStorage.getItem(
            this.key(
                [ this.$prefix, key ],
            ),
        );

        if (value === null) {
            if (defaultValue !== undefined) {
                value = defaultValue;
            }
        } else {
            value = JSON.parse(value);
        }

        return value;
    }

    /**
     * Check if data exist at key
     *
     * @param key
     */
    has(key: string) {
        return this.get(key) !== null;
    }

    /**
     * Build key from array
     *
     * @param parts
     */
    key(parts: Array<string>) {
        return parts.join(this.$separator);
    }

    /**
     * Set value of key
     *
     * @param key
     * @param value
     */
    set(key: string, value: any) {
        localStorage.setItem(
            this.key(
                [ this.$prefix, key ],
            ),
            JSON.stringify(value),
        );

        return this;
    }

    /**
     * Remove data at key
     *
     * @param key
     */
    unset(key: string) {
        localStorage.removeItem(
            this.key(
                [ this.$prefix, key ],
            ),
        );

        return this;
    }
}
