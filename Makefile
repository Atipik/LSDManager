clean:
	@rm -rf ./js-cov
	@rm -rf ./covershot
	@rm -f ./xunit.xml
	@rm -f ./js/noun.js
	@rm -rf ./build/*

lint: clean
	@jshint --config jshintrc.json ./js/noun.*.js

test: clean
	@./node_modules/atoum.js/bin/atoum -d tests

js: test
	@./node_modules/browserify/bin/cmd.js js/main.js > js/noun.js

build: js
	@test -d build || mkdir build
	@cp -r {css,fonts,img,index.html,config.json,carousel.json} build

	@mkdir build/js
	@cp -r js/{bootstrap,jquery,prettify}.js build/js
	@mv js/noun.js build/js/noun.js