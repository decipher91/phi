app.provider('dynamicDirectiveManager', [ function() {
  var $compileProvider;

  this.setCompileProvider = function(compileProvider) {
    if (!compileProvider) {
      throw new Error('Compile provider must not be null.');
    }

    $compileProvider = compileProvider;
  };

  var DynamicDirectiveManager = [ "$compileProvider", "dynamicDirectiveSuffixGenerator",
      function($compileProvider, dynamicDirectiveSuffixGenerator) {
        if (!$compileProvider) {
          throw new Error('Compile provider must not be null.');
        }

        var defaultSuffixGenerator = dynamicDirectiveSuffixGenerator;
        var dynDirectives = {};
        var registeredDirectives = {};
        var regex = /^[a-z0-9]+$/;

        /**
         * Adds a dynamic directive controller instance to the manager.
         * 
         * @param {string}
         *          normalizedElementName Pascal-cased name of the directive.
         * @param {*}
         *          dynamicDirectiveController A dynamic directive controller.
         */
        this.add = function(normalizedElementName, dynamicDirectiveController) {
          if (!normalizedElementName) {
            throw new Error('Name must not be empty.');
          }

          if (!dynamicDirectiveController) {
            throw new Error('Dynamic directive controller must not be null.');
          }

          var directives = dynDirectives[normalizedElementName];

          if (!directives) {
            directives = [];
            dynDirectives[normalizedElementName] = directives;

          } else if (directives.indexOf(dynamicDirectiveController) >= 0) {
            return;
          }

          directives.push(dynamicDirectiveController);

          var suffixes = registeredDirectives[normalizedElementName];
          if (suffixes) {
            dynamicDirectiveController.recompile(suffixes._last);
          }
        };

        /**
         * Removes a dynamic directive controller from the manager.
         * 
         * @param {string}
         *          normalizedElementName Pascal-cased name of the directive.
         * @param {*}
         *          dynamicDirectiveController A dynamic directive controller.
         */
        this.remove = function(normalizedElementName, dynamicDirectiveController) {
          if (!normalizedElementName) {
            throw new Error('Name must not be empty.');
          }

          if (!dynamicDirectiveController) {
            throw new Error('Dynamic directive controller must not be null.');
          }

          var directives = dynDirectives[normalizedElementName];

          if (directives) {
            var index = directives.indexOf(dynamicDirectiveController);

            if (index >= 0) {
              directives.splice(index, 1);
            }
          }

        };

        /**
         * Registers a new directive.
         * 
         * @param {string}
         *          normalizedName Pascal-cased directive name.
         * @param {function}
         *          constructor Directive constructor
         * @param {*}
         *          [suffix] If suffix equals false than no suffix is appended;
         *          if suffix is undefined than a random suffix is generated;
         *          otherwise the suffix is converted to string.
         */
        this.registerDirective = function(normalizedName, constructor, suffix) {
          var nameWithSuffix = normalizedName;
          suffix = prepareSuffix(normalizedName, suffix);

          if (!angular.isUndefined(suffix)) {
            nameWithSuffix = nameWithSuffix + suffix;
          }

          var registerDirective = true;
          var suffixes = registeredDirectives[normalizedName];

          if (!suffixes) {
            suffixes = {};
            registeredDirectives[normalizedName] = suffixes;
          }

          if (suffixes[suffix]) {
            registerDirective = false;
          } else {
            suffixes[suffix] = true;
          }

          suffixes._last = suffix;

          if (!$compileProvider) {
            app.directive(nameWithSuffix, constructor);
          } else {
            if (registerDirective) {
              $compileProvider.directive.apply(null, [ nameWithSuffix, constructor ]);
            }

            recompile(normalizedName, suffix);
          }
        };

        /**
         * Changes the suffix generator.
         * 
         * @param {{generateSuffix:Function}}
         *          suffixGenerator
         */
        this.changeSuffixGenerator = function(suffixGenerator) {
          if (angular.isUndefined(suffixGenerator) || (suffixGenerator === null)) {
            dynamicDirectiveSuffixGenerator = defaultSuffixGenerator;
            return;
          }

          if (!angular.isFunction(suffixGenerator.generateSuffix)) {
            throw new Error('Suffix generator must have a function "generateSuffix".');
          }

          dynamicDirectiveSuffixGenerator = suffixGenerator;
        };

        /**
         * Changes the suffix of all dynamic directives.
         * 
         * @param {*}
         *          [suffix] If suffix equals false than no suffix is appended;
         *          if suffix is undefined than a random suffix is generated;
         *          otherwise the suffix is converted to string.
         */
        this.changeSuffix = function(suffix) {

          _.each(dynDirectives, function(directives, normalizedName) {

            var preparedSuffix = prepareSuffix(normalizedName, suffix);
            var suffixes = registeredDirectives[normalizedName];

            if (suffixes) {
              suffixes._last = preparedSuffix;
            }

            angular.forEach(directives, function(dynamicDirective) {
              dynamicDirective.recompile(preparedSuffix);
            });
          });
        };

        function prepareSuffix(normalizedName, suffix) {
          if (suffix === false) {
            return undefined;
          }

          if (angular.isUndefined(suffix)) {
            suffix = dynamicDirectiveSuffixGenerator.generateSuffix(normalizedName);
          }

          if (!regex.test(suffix)) {
            throw new Error('Suffix must consist of lowercased characters (a-z) and number (0-9) only.');
          } else {
            suffix = suffix + '';
            suffix = suffix.substr(0, 1).toUpperCase() + suffix.substr(1);
          }

          return suffix;
        }

        function recompile(normalizedElementName, suffix) {
          var directives = dynDirectives[normalizedElementName];

          if (directives) {
            angular.forEach(directives, function(dynamicDirective) {
              dynamicDirective.recompile(suffix);
            });
          }
        }
      } ];

  this.$get = [ "$injector", "dynamicDirectiveSuffixGenerator", function($injector, dynamicDirectiveSuffixGenerator) {
    var inst = $injector.instantiate(DynamicDirectiveManager, {
      '$compileProvider' : $compileProvider,
      'dynamicDirectiveSuffixGenerator' : dynamicDirectiveSuffixGenerator
    });
    return inst;
  } ];
} ]);

app.service('dynamicDirectiveSuffixGenerator', [ function() {
  /**
   * @param {string}
   *          normalizedName
   * @returns {string}
   */
  this.generateSuffix = function(normalizedName) {
    return new Date().getTime() + '';
  };
} ]);

app.directive('dynamicDirective', [ "$compile", "dynamicDirectiveManager", function($compile, dynamicDirectiveManager) {

  function safeApply(scope, fn) {
    var phase = scope.$root.$$phase;

    if (phase === '$apply' || phase === '$digest') {
      if (fn && (typeof (fn) === 'function')) {
        fn();
      }
    } else {
      scope.$apply(fn);
    }
  }

  function DynamicDirectiveContext($compile, dynamicDirectiveManager, controller, elementName, attrs) {

    if (!elementName) {
      throw new Error('Element name must not null nor empty.');
    }

    var normalizedName = attrs.$normalize(elementName);
    var currentInnerElement;

    // taken from angular.js
    var SNAKE_CASE_REGEXP = /[A-Z]/g;

    function snakeCase(name, separator) {
      separator = separator || '_';
      return name.replace(SNAKE_CASE_REGEXP, function(letter, pos) {
        return (pos ? separator : '') + letter.toLowerCase();
      });
    }

    function createElement(currentSuffix) {

      var name = elementName;

      if (angular.isDefined(currentSuffix) && (currentSuffix !== null)) {
        name = name + '-' + currentSuffix;
      }

      var directiveElem = angular.element(document.createElement(name));
      var attrsToOmit = [ 'elementName', '$attr' ];

      angular.forEach(attrs, function(value, key) {
        if (attrs.hasOwnProperty(key) && (attrsToOmit.indexOf(key) < 0) && (key.indexOf('$$') !== 0)) {
          directiveElem.attr(snakeCase(key, '-'), value);
        }
      });

      return directiveElem;
    }

    this.recompileInnerElement = function(scope, element, suffix) {
      this.destroyInnerElement(scope, element);

      currentInnerElement = createElement(suffix);
      element.append(currentInnerElement);
      $compile(currentInnerElement)(scope);
    };

    this.destroyInnerElement = function(scope, element) {
      destroyInnerScope(scope);
      element.html(null);
    };

    function destroyInnerScope(scope) {
      if (currentInnerElement) {
        var innerScope = currentInnerElement.isolateScope() || currentInnerElement.scope();

        if (innerScope && (innerScope !== scope)) {
          innerScope.$destroy();
        }
      }
    }

    this.register = function() {
      dynamicDirectiveManager.add(normalizedName, controller);
    };

    this.unregister = function() {
      dynamicDirectiveManager.remove(normalizedName, controller);
    };
  }

  function DummyDynamicDirectiveContext() {

    this.register = function() {
    };

    this.unregister = function() {
    };

    this.recompileInnerElement = function() {
    };

    this.destroyInnerElement = function() {
    };
  }

  return {
    restrict : 'AE',
    require : 'dynamicDirective',
    controller : [ "$scope", function($scope) {
    } ],
    compile : function() {

      // Looks like it should be in per-instanse scope
      // var currentSuffix;
      // var ctx = new DummyDynamicDirectiveContext();

      return {
        post : function(scope, element, attrs, controller) {
          var currentSuffix;
          var ctx = new DummyDynamicDirectiveContext();

          controller.recompile = function(suffix) {
            if (currentSuffix === suffix) {
              return;
            }

            currentSuffix = suffix;

            safeApply(scope, function() {
              ctx.recompileInnerElement(scope, element, currentSuffix);
            });
          };

          ctx.register();
          ctx.recompileInnerElement(scope, element, currentSuffix);

          scope.$on('$destroy', function() {
            ctx.unregister();
          });

          attrs.$observe('elementName', function(newName, oldName) {
            if (newName !== oldName) {
              ctx.unregister();
              ctx.destroyInnerElement(scope, element);

              if (newName) {
                ctx = new DynamicDirectiveContext($compile, dynamicDirectiveManager, controller, newName, attrs);
              } else {
                ctx = new DummyDynamicDirectiveContext();
              }

              ctx.register();
              // Commented to prevent double compiling
              // ctx.recompileInnerElement(scope, element, currentSuffix);
            }
          });
        }
      };
    }
  };
} ]);

/* grab the $compileProvider */
app.config([ "$compileProvider", "dynamicDirectiveManagerProvider", function($compileProvider, dynamicDirectiveManagerProvider) {
  dynamicDirectiveManagerProvider.setCompileProvider($compileProvider);
} ]).run([ "dynamicDirectiveManager", function(dynamicDirectiveManager) {
  app.dynamicDirectiveManager = dynamicDirectiveManager;
} ]);