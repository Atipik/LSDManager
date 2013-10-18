require("atoum.js")(module);

var testedClass = require("../src/lsd.js");

module.exports = {
    testClass: function () {
        var lsd;

        this
            .if(lsd = new LSD())
                .integer(lsd.eventId)
                    .isEqualTo(0)
                .object(lsd.events)
    this.entitiesMetadata = {};
    this.storage

        ;
    }
};