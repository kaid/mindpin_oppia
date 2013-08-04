// Copyright 2012 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Controllers for an editor's main exploration page.
 *
 * @author sll@google.com (Sean Lip)
 */

var END_DEST = 'END';
var QN_DEST_PREFIX = 'q-';
var GUI_EDITOR_URL = '/gui';
var STATS_VIEWER_URL = '/stats';

// TODO(sll): Move all strings to the top of the file and internationalize them.
// TODO(sll): console.log is not supported in IE.

oppia.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
      when(GUI_EDITOR_URL + '/:stateId',
           {templateUrl: '/editor_views/gui_editor', controller: GuiEditor}).
      when(STATS_VIEWER_URL,
           {templateUrl: '/editor_views/gui_editor', controller: StatsViewerTab}).
      when('/', {templateUrl: '/editor_views/gui_editor', controller: ExplorationTab}).
      otherwise({redirectTo: '/'});
}]);

// Receive events from the iframed widget repository.
oppia.run(function($rootScope) {
  window.addEventListener('message', function(event) {
    $rootScope.$broadcast('message', event);
  });
});


function StatsViewerTab($scope, explorationData) {
  // Changes the tab to the Stats Viewer view.
  $('#editorViewTab a[href="#statsViewer"]').tab('show');
  $scope.stateId = '';
  explorationData.stateId = '';
}

function ExplorationTab($scope, explorationData) {
  // Changes the tab to the Exploration Editor view.
  $('#editorViewTab a[href="#explorationMap"]').tab('show');
  $scope.stateId = '';
  explorationData.stateId = '';
}

function EditorExploration($scope, $http, $location, $route, $routeParams,
    $filter, explorationData, warningsData, activeInputData) {

  /********************************************
  * Methods affecting the URL location hash.
  ********************************************/
  // Changes the location hash when the editorView tab is changed.
  $('#editorViewTab a[data-toggle="tab"]').on('shown', function (e) {
    if (e.target.hash == '#stateEditor') {
      explorationData.getStateData(explorationData.stateId);
      $location.path(GUI_EDITOR_URL + '/' + explorationData.stateId);
      $scope.$apply();
      $scope.stateName = explorationData.data.states[explorationData.stateId].name;
    } else if (e.target.hash == '#statsViewer') {
      $location.path('stats');
      explorationData.stateId = '';
      $scope.stateId = '';
      $scope.$apply();
    } else if (e.target.hash == '#explorationMap') {
      $location.path('');
      explorationData.stateId = '';
      $scope.stateId = '';
      // TODO(sll): If $apply() is not called, the $scope.stateId change does
      // not propagate and the 'State Details' tab is still shown. Why?
      $scope.$apply();
      $scope.$broadcast('updateViz', null);
    }
  });


  /**********************************************************
   * Called on initial load of the exploration editor page.
   *********************************************************/
  var explorationFullyLoaded = false;

  // The pathname should be: .../create/{exploration_id}[/{state_id}]
  $scope.explorationId = pathnameArray[2];
  $scope.explorationUrl = '/create/' + $scope.explorationId;
  $scope.explorationDataUrl = '/create/' + $scope.explorationId + '/data';

  // Initializes the exploration page using data from the backend.
  explorationData.getData().then(function(data) {
    $scope.stateId = explorationData.stateId;
    $scope.states = data.states;
    $scope.explorationImageId = data.image_id;
    $scope.explorationTitle = data.title;
    $scope.explorationCategory = data.category;
    $scope.explorationEditors = data.editors;
    $scope.initStateId = data.init_state_id;
    $scope.isPublic = data.is_public;
    $scope.currentUser = data.user;
    $scope.parameters = data.parameters || [];//TODO(yanamal): make sure this works when explorations actually have parameters

    $scope.stats = {
      'numVisits': data.num_visits,
      'numCompletions': data.num_completions,
      'stateStats': data.state_stats,
      'imp': data.imp
    };

    $scope.chartData = [
      ['', 'Completions', 'Non-completions'],
      ['', data.num_completions, data.num_visits - data.num_completions]
    ];
    $scope.chartColors = ['green', 'firebrick'];
    $scope.ruleChartColors = ['cornflowerblue', 'transparent'];

    $scope.statsGraphOpacities = {};
    for (var stateId in $scope.states) {
      var visits = $scope.stats.stateStats[stateId].firstEntryCount;
      $scope.statsGraphOpacities[stateId] = Math.max(
          visits / $scope.stats.numVisits, 0.05);
    }
    $scope.statsGraphOpacities[END_DEST] = Math.max(
        $scope.stats.numCompletions / $scope.stats.numVisits, 0.05);

    $scope.highlightStates = {};
    for (var i = 0; i < data.imp.length; i++) {
      $scope.highlightStates[data.imp[i].state_id] = '#EE8800';
    }

    $scope.graphData = $scope.reformatResponse(
          data.states, data.init_state_id);

    explorationFullyLoaded = true;
  });

  $scope.$watch('explorationCategory', function(newValue, oldValue) {
    // Do not save on the initial data load.
    if (oldValue !== undefined) {
      $scope.saveExplorationProperty(
          'explorationCategory', 'category', newValue, oldValue);
    }
  });

  $scope.reformatResponse = function(states, initStateId) {
    var SENTINEL_DEPTH = 3000;
    var VERT_OFFSET = 20;
    var HORIZ_SPACING = 150;
    var VERT_SPACING = 100;
    var HORIZ_OFFSET = 100;
    var nodes = {};
    var state;
    nodes[END_DEST] = {name: END_DEST, depth: SENTINEL_DEPTH, reachable: false};
    for (state in states) {
      nodes[state] = {name: states[state].name, depth: SENTINEL_DEPTH, reachable: false};
    }
    nodes[initStateId].depth = 0;

    var maxDepth = 0;
    var seenNodes = [initStateId];
    var queue = [initStateId];
    var maxXDistPerLevel = {0: HORIZ_OFFSET};
    nodes[initStateId].y0 = VERT_OFFSET;
    nodes[initStateId].x0 = HORIZ_OFFSET;

    var handlers, ruleSpecs, h, i;

    while (queue.length > 0) {
      var currNode = queue[0];
      queue.shift();
      nodes[currNode].reachable = true;
      if (currNode in states) {
        handlers = states[currNode].widget.handlers;
        for (h = 0; h < handlers.length; h++) {
          ruleSpecs = handlers[h].rule_specs;
          for (i = 0; i < ruleSpecs.length; i++) {
            // Assign levels to nodes only when they are first encountered.
            if (seenNodes.indexOf(ruleSpecs[i].dest) == -1) {
              seenNodes.push(ruleSpecs[i].dest);
              nodes[ruleSpecs[i].dest].depth = nodes[currNode].depth + 1;
              nodes[ruleSpecs[i].dest].y0 = (nodes[currNode].depth + 1) * VERT_SPACING + VERT_OFFSET;
              if (nodes[currNode].depth + 1 in maxXDistPerLevel) {
                nodes[ruleSpecs[i].dest].x0 = maxXDistPerLevel[nodes[currNode].depth + 1] + HORIZ_SPACING;
                maxXDistPerLevel[nodes[currNode].depth + 1] += HORIZ_SPACING;
              } else {
                nodes[ruleSpecs[i].dest].x0 = HORIZ_OFFSET;
                maxXDistPerLevel[nodes[currNode].depth + 1] = HORIZ_OFFSET;
              }
              maxDepth = Math.max(maxDepth, nodes[currNode].depth + 1);
              queue.push(ruleSpecs[i].dest);
            }
          }
        }
      }
    }

    var horizPositionForLastRow = HORIZ_OFFSET;
    var node;
    for (node in nodes) {
      if (nodes[node].depth == SENTINEL_DEPTH) {
        nodes[node].depth = maxDepth + 1;
        nodes[node].y0 = VERT_OFFSET + nodes[node].depth * VERT_SPACING;
        nodes[node].x0 = horizPositionForLastRow;
        horizPositionForLastRow += HORIZ_SPACING;
      }
    }

    // Assign unique IDs to each node.
    var idCount = 0;
    var nodeList = [];
    for (node in nodes) {
      var nodeMap = nodes[node];
      nodeMap['hashId'] = node;
      nodeMap['id'] = idCount;
      nodes[node]['id'] = idCount;
      idCount++;
      nodeList.push(nodeMap);
    }

    var links = [];
    for (state in states) {
      handlers = states[state].widget.handlers;
      for (h = 0; h < handlers.length; h++) {
        ruleSpecs = handlers[h].rule_specs;
        for (i = 0; i < ruleSpecs.length; i++) {
          links.push({
            source: nodeList[nodes[state].id],
            target: nodeList[nodes[ruleSpecs[i].dest].id],
            name: $filter('parameterizeRuleDescription')({
                description: ruleSpecs[i].description,
                inputs: ruleSpecs[i].inputs
            })
          });
        }
      }
    }

    return {nodes: nodeList, links: links, initStateId: initStateId};
  };


  $scope.$watch('explorationTitle', function(newValue, oldValue) {
    // Do not save on the initial data load.
    if (oldValue !== undefined) {
      $scope.saveExplorationProperty(
          'explorationTitle', 'title', newValue, oldValue);
    }
  });

  //TODO: also add values list 
  $scope.addParameter = function(name, type) {
    console.log("adding parameter to exploration");
    $scope.parameters.push({name:name, obj_type:type});
    $http.put(
        $scope.explorationDataUrl,
        $scope.createRequest({parameters: $scope.parameters}),
        {headers: {'Content-Type': 'application/x-www-form-urlencoded'}}).
            success(function(data) {
              console.log('PUT request succeeded');
            }).
            error(function(data) {
              warningsData.addWarning(
                  'Error adding parameter: ' + data.error);
              $scope.parameters.pop();
            });
  };

  $scope.openAddNewEditorForm = function() {
    activeInputData.name = 'explorationMetadata.addNewEditor';
  };

  $scope.closeAddNewEditorForm = function() {
    $scope.newEditorEmail = '';
    activeInputData.name = 'explorationMetadata';
  };


  $scope.openAddExplorationImageForm = function() {
    activeInputData.name = 'explorationMetadata.addNewImage';
  };

  $scope.closeAddExplorationImageForm = function() {
    activeInputData.name = 'explorationMetadata';
  };


  $scope.addNewEditor = function(newEditorEmail) {
    activeInputData.name = 'explorationMetadata';
    $scope.explorationEditors.push(newEditorEmail);

    $http.put(
        $scope.explorationDataUrl,
        $scope.createRequest({editors: $scope.explorationEditors}),
        {headers: {'Content-Type': 'application/x-www-form-urlencoded'}}).
            success(function(data) {
              console.log('PUT request succeeded');
            }).
            error(function(data) {
              warningsData.addWarning(
                  'Error adding collaborator: ' + data.error);
              $scope.explorationEditors.pop();
            });
  };

  /**
   * Downloads the YAML representation of an exploration.
   */
  $scope.downloadExploration = function() {
    document.location = '/create/download/' + $scope.explorationId;
  };

  $scope.makePublic = function() {
    $scope.saveExplorationProperty('isPublic', 'is_public', true, false);
  };

  $scope.deleteExplorationImage = function() {
    $scope.saveExplorationProperty(
        'explorationImageId', 'image_id', null, $scope.explorationImageId);
  };

  $scope.saveExplorationImage = function() {
    activeInputData.name = 'explorationMetadata';
    $scope.saveImage(function(data) {
      $scope.explorationImageId = data.image_id;
      $scope.saveExplorationProperty(
          'explorationImageId', 'image_id', $scope.explorationImageId, null);
    });
  };

  /**
   * Saves a property of an exploration (e.g. title, category, etc.)
   * @param {string} frontendName The frontend name of the property to save
   *     (e.g. explorationTitle, explorationCategory)
   * @param {string} backendName The backend name of the property (e.g. title, category)
   * @param {string} newValue The new value of the property
   * @param {string} oldValue The previous value of the property
   */
  $scope.saveExplorationProperty = function(frontendName, backendName, newValue, oldValue) {
    if (!explorationFullyLoaded) {
      return;
    }
    if (oldValue && !$scope.isValidEntityName($scope[frontendName], true)) {
      $scope[frontendName] = oldValue;
      return;
    }
    var requestParameters = {};
    requestParameters[backendName] = newValue;

    $http.put(
        $scope.explorationDataUrl,
        $scope.createRequest(requestParameters),
        {headers: {'Content-Type': 'application/x-www-form-urlencoded'}}).
            success(function(data) {
              if (frontendName == 'isPublic' || frontendName == 'explorationImageId') {
                $scope[frontendName] = newValue;
              }
              console.log('PUT request succeeded');
            }).
            error(function(data) {
              warningsData.addWarning(
                  'Error modifying exploration properties: ' + data.error);
              $scope[frontendName] = oldValue;
            });
  };

  $scope.initializeNewActiveInput = function(newActiveInput) {
    // TODO(sll): Rework this so that in general it saves the current active
    // input, if any, first. If it is bad input, display a warning and cancel
    // the effects of the old change. But, for now, each case is handled
    // specially.
    console.log('Current Active Input: ' + activeInputData.name);
    if (activeInputData.name == 'stateName') {
      $scope.saveStateName();
    }

    var inputArray = newActiveInput.split('.');

    activeInputData.name = (newActiveInput || '');
    // TODO(sll): Initialize the newly displayed field.
  };

  // Adds a new state to the list of states, and updates the backend.
  $scope.addState = function(newStateName, successCallback) {
    if (!$scope.isValidEntityName(newStateName, true))
      return;
    if (newStateName.toUpperCase() == END_DEST) {
      warningsData.addWarning('Please choose a state name that is not \'END\'.');
      return;
    }
    for (var id in $scope.states) {
      if (id != $scope.stateId && $scope.states[id]['name'] == newStateName) {
        warningsData.addWarning('A state with this name already exists.');
        return;
      }
    }

    $http.post(
        $scope.explorationDataUrl,
        $scope.createRequest({state_name: newStateName}),
        {headers: {'Content-Type': 'application/x-www-form-urlencoded'}}).
            success(function(data) {
              $scope.newStateDesc = '';
              if (successCallback) {
                successCallback(data);
              }
              window.location = $scope.explorationUrl;
            }).error(function(data) {
              warningsData.addWarning(
                  'Server error when adding state: ' + data.error);
            });
  };

  $scope.getStateName = function(stateId) {
    return stateId ? explorationData.data.states[stateId].name : '[none]';
  };

  $scope.openDeleteStateModal = function(stateId) {
    $scope.deleteStateId = stateId;
    $scope.$apply();
    $('#deleteStateModal').modal('show');
  };

  $('#deleteStateModal').on('hidden', function() {
    $scope.deleteStateId = '';
  });

  // Deletes the state with id stateId. This action cannot be undone.
  $scope.deleteState = function(stateId) {
    if (stateId == $scope.initStateId) {
      warningsData.addWarning('Deleting the initial state of a question is not ' +
          'supported. Perhaps edit it instead?');
      return;
    }

    $http['delete']($scope.explorationUrl + '/' + stateId + '/data')
    .success(function(data) {
      window.location = $scope.explorationUrl;
    }).error(function(data) {
      warningsData.addWarning(data.error || 'Error communicating with server.');
    });
  };

  $scope.deleteExploration = function() {
    $http['delete']($scope.explorationDataUrl)
    .success(function(data) {
      window.location = '/gallery/';
    });
  };

  // parameter logic

  //controllers for ui boxes: parameter and value options/list
  $scope.paramSelector = {
    createSearchChoice:function(term, data) {
      if ($(data).filter(function() {
        return this.text.localeCompare(term) === 0;
      }).length===0) {
        return {id: 'new', text: term};
      }
    },
    data:[],
    formatNoMatches:function(term) {
      return '(choose a parameter name)';
    }
  };
  $scope.valueSelector = {
    createSearchChoice:function(term, data) {
      if ($(data).filter(function() {
        return this.text.localeCompare(term) === 0;
      }).length === 0) {
        return {id: term, text: '"' + term + '"'};
      }
    },
    data: [],
    tokenSeparators: [','],
    formatNoMatches:function(term) {
      return '(list new values)';
    }
  };

  // initialize dropdown options for both selectors in the parameter interface
  // (parameter name, parameter value(s) )
  // also applies to the per-state parameter change interface
  // the select2 library expects the options to have 'id' and 'text' fields.
  $scope.initSelectorOptions = function() {
    var namedata = [];
    $scope.parameters.forEach(function(param){
      namedata.push({id:param.name, text:param.name});
    });
    angular.extend($scope.paramSelector.data, namedata);

    // TODO(yanamal): the student input option only applies to parameter
    // changes that are associated with actions
    var changedata = [{id:'{{answer}}', text:'Answer'}];
    $scope.parameters.forEach(function(param){
      changedata.push({id:'{{'+param.name+'}}', text:param.name});
    });
    angular.extend($scope.valueSelector.data, changedata);
  };

  //reset and/or initialize variables for parameter input
  $scope.resetParamInput = function() {
    $scope.editingParam = null; //used to determine what to display in the html
    $scope.tmpParamName = '';
    $scope.tmpParamDesc = '';
    $scope.tmpParamValues = [];
  };

  $scope.resetParamInput();

  //start editing/adding a parameter change
  $scope.startAddParam = function() {
    $scope.editingParam = 'New change';
    $scope.initSelectorOptions();
  };

  // TODO(sll): Change the following to take an $index.
  $scope.startEditParam = function(index) {
    var param = $scope.parameters[index];
    fields = $scope.initParamFields(param);
    $scope.tmpParamName = fields[0];
    $scope.tmpParamDesc = fields[1];
    $scope.tmpParamValues = fields[2];
    $scope.editingParam = index;
  };

  $scope.initParamFields = function(param) {
    var pName = param.name;
    tmpParamName = {id:pName, text: pName};
    tmpParamDesc = param.description;

    tmpParamValues = [];
    if(param.values) {
      (param.values).forEach(function(change){
        // I think other stuff, like hashes, ends up in this object
        if (typeof change === 'string') {
          var txt = '';
          if(change.lastIndexOf('{{', 0) === 0) {
            // change starts with '{{', so it is a variable.
            txt = change.substring(2, change.length - 2);
          }
          else {
            // otherwise, it is a literal; display in quotes
            txt = '"' + change + '"';
          }
          tmpParamValues.push({id:change, text:txt});
        }
      });
    }
    $scope.initSelectorOptions();
    return [tmpParamName, tmpParamDesc, tmpParamValues];
  };

  // TODO(yanamal): there is $scope.addParameter and an unrelated
  // $scope.addParam. probably bad.
  $scope.addParam = function(index) {
    if (!$scope.tmpParamName) {
      warningsData.addWarning('Please specify a parameter name.');
      return;
    }
    // TODO(yanamal): function that takes in name, values, description, and
    // outputs object to push?
    // needs to have ways to specify whether to include description (and other
    // fields?)
    // maybe just if null, don't include? will this break expectations on the
    // server side?

    // tmpParamName as output by the selector is usually of the format
    // {id:param_name, text:param_name}
    // except when the user is creating a new parameter, then it is
    // {id:'new', text:param_name}
    var name = $scope.tmpParamName.text;
    // tmpParamValues comes back with the string that needs to be stored as
    // the id; for changing to other parameter values or student input, this is
    // {{pname}} or {{input}}. Otherwise the value option is interpreted as a
    // string literal
    var vals = [];
    $scope.tmpParamValues.forEach(function(val) {
      vals.push(val.id);
    });

    if (index !== 'New change') {
      $scope.parameters[index] = {
        'obj_type': 'UnicodeString', 'values': vals, 'name': name,
        'description': $scope.tmpParamDesc};
    } else {
      $scope.parameters.push({
        'obj_type': 'UnicodeString',
        'values': vals,
        'name': name,
        'description': $scope.tmpParamDesc
      });
    }

    $scope.saveParams();
    $scope.resetParamInput();
  };

  $scope.saveParams = function() {
    var requestParameters = {};
    requestParameters['parameters'] = $scope.parameters;

    console.log(requestParameters);
    console.log(JSON.stringify(requestParameters));

    // TODO: separate out/reuse logic for saving params? (also used in
    // addParameter)
    $http.put(
        $scope.explorationDataUrl,
        $scope.createRequest({parameters: $scope.parameters}),
        {headers: {'Content-Type': 'application/x-www-form-urlencoded'}}).
            success(function(data) {
              console.log('PUT request succeeded');
            }).
            error(function(data) {
              warningsData.addWarning(
                  'Error modifying exploration parameters: ' + data.error);
            });
  };
}

/**
 * Injects dependencies in a way that is preserved by minification.
 */
EditorExploration.$inject = ['$scope', '$http', '$location', '$route',
    '$routeParams', '$filter', 'explorationData', 'warningsData', 'activeInputData'];
ExplorationTab.$inject = ['$scope', 'explorationData'];