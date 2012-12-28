// Licensed under the Apache License, Version 2.0 (the 'License');
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an 'AS-IS' BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Angular controllers for the editor's state graph.
 *
 * @author sll@google.com (Sean Lip)
 */

function EditorGraph($scope, $http, explorationData) {
  // When the exploration data is loaded, construct the graph.
  $scope.$on('explorationData', function() {
    $scope.graphData = $scope.reformatResponse(
        explorationData.states, explorationData.initState);
  });

  // Reformat the model into a response that is processable by d3.js.
  $scope.reformatResponse = function(states, initStateId) {
    var SENTINEL_DEPTH = 3000;
    var VERT_OFFSET = 20;
    var HORIZ_SPACING = 100;
    var VERT_SPACING = 100;
    var nodes = {};
    nodes['-1'] = {name: 'END', depth: SENTINEL_DEPTH, reachable: false};
    for (var state in states) {
      nodes[state] = {name: states[state].desc, depth: SENTINEL_DEPTH, reachable: false};
    }
    nodes[initStateId].depth = 0;

    var maxDepth = 0;
    var seenNodes = [initStateId];
    var queue = [initStateId];
    var maxXDistPerLevel = {0: 50};
    nodes[initStateId].y0 = VERT_OFFSET;
    nodes[initStateId].x0 = 50;

    while (queue.length > 0) {
      var currNode = queue[0];
      queue.shift();
      nodes[currNode].reachable = true;
      if (currNode in states) {
        for (var i = 0; i < states[currNode].dests.length; i++) {
          // Assign levels to nodes only when they are first encountered.
          if (seenNodes.indexOf(states[currNode].dests[i].dest) == -1) {
            seenNodes.push(states[currNode].dests[i].dest);
            nodes[states[currNode].dests[i].dest].depth = nodes[currNode].depth + 1;
            nodes[states[currNode].dests[i].dest].y0 = (nodes[currNode].depth + 1) * VERT_SPACING + VERT_OFFSET;
            if (nodes[currNode].depth + 1 in maxXDistPerLevel) {
              nodes[states[currNode].dests[i].dest].x0 = maxXDistPerLevel[nodes[currNode].depth + 1] + HORIZ_SPACING;
              maxXDistPerLevel[nodes[currNode].depth + 1] += HORIZ_SPACING;
            } else {
              nodes[states[currNode].dests[i].dest].x0 = 50;
              maxXDistPerLevel[nodes[currNode].depth + 1] = 50;
            }
            maxDepth = Math.max(maxDepth, nodes[currNode].depth + 1);
            queue.push(states[currNode].dests[i].dest);
          }
        }
      }
    }

    var horizPositionForLastRow = 50;
    for (var node in nodes) {
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
    for (var node in nodes) {
      var nodeMap = nodes[node];
      nodeMap['hashId'] = node;
      nodeMap['id'] = idCount;
      nodes[node]['id'] = idCount;
      idCount++;
      nodeList.push(nodeMap);
    }

    console.log('NODES');
    console.log(nodes);

    var links = [];
    for (var state in states) {
      for (var i = 0; i < states[state].dests.length; i++) {
        links.push({source: nodeList[nodes[state].id], target: nodeList[nodes[states[state].dests[i].dest].id], name: states[state].dests[i].category});
      }
    }
    console.log(links);

    return {nodes: nodeList, links: links, initStateId: initStateId};
  };
};


oppia.directive('stateGraphViz', function (stateData) {
  // constants
  var w = 960,
      h = 400,
      i = 0,
      duration = 400;

  return {
    restrict: 'E',
    scope: {
      val: '=',
      grouped: '='
    },
    link: function (scope, element, attrs) {
      var vis = d3.select(element[0]).append("svg:svg")
          .attr("width", w)
          .attr("height", h)
          .attr("class", "oppia-graph-viz")
        .append("svg:g")
          .attr("transform", "translate(20,30)");

      scope.$watch('val', function (newVal, oldVal) {
        // clear the elements inside of the directive
        vis.selectAll('*').remove();

        // if 'val' is undefined, exit
        if (!newVal) {
          return;
        }

        var source = newVal;
        var nodes = source.nodes;
        var links = source.links;
        var initStateId = source.initStateId;


        // Update the links
        var link = vis.selectAll("path.link")
            .data(links, function(d) { return d; });

        vis.append("svg:defs").selectAll('marker')
            .data(['arrowhead'])
          .enter().append("svg:marker")
            .attr("id", String)
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 25)
            .attr("refY", -1.5)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
          .append("svg:path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", "red");

        var linkEnter = link.enter().append("svg:g")
            .attr("class", "link");

        linkEnter.insert("svg:path", "g")
            .style("stroke-width", 3)
            .style("stroke", "red")
            .attr("class", "link")
            .attr("d", function(d) {
              // Draw elliptical arcs.
              var dx = d.target.x0 - d.source.x0,
                  dy = d.target.y0 - d.source.y0,
                  dr = Math.sqrt(dx * dx + dy * dy);
              return "M" + d.source.x0 + "," + d.source.y0 + "A" + dr + "," + dr + " 0 0,1 " + d.target.x0 + "," + d.target.y0;
            })
            .attr("marker-end", function(d) {
              if (d.source.x0 == d.target.x0 && d.source.y0 == d.target.y0) {
                return '';
              } else {
                return "url(#arrowhead)";
              }
            });

        linkEnter.append("svg:text")
            .attr("dy", function(d) { return d.source.y0*0.5 + d.target.y0*0.5; })
            .attr("dx", function(d) { return d.source.x0*0.5 + d.target.x0*0.5; })
            .attr('color', 'black')
            .text(function(d) {
              if (d.source.x0 == d.target.x0 && d.source.y0 == d.target.y0) {
                return '';
              }
              return d.name;
            });




        // Update the nodes
        // TODO(sll): Put a blue border around the current node.
        var node = vis.selectAll("g.node")
            .data(nodes, function(d) { return d.id || (d.id = ++i); });

        var nodeEnter = node.enter().append("svg:g")
            .attr("class", "node");

        // Add nodes to the canvas.
        nodeEnter.append("svg:circle")
            .attr("cy", function(d) { return d.y0; })
            .attr("cx", function(d) { return d.x0; })
            .attr("r", function(d) {
              if (d.hashId == initStateId) {
                return 40;
              } else {
                return 30;
              }
            })
            .attr("class", function(d) {
              if (d.hashId != '-1') {
                return "clickable";
              }
            })
            .style("fill", function(d) {
              if (d.reachable == false) {
                return "pink";
              } else if (d.hashId == '-1') {
                return "olive";
              } else {
                return "beige";
              }
            })
            .on("click", function (d) {
              if (d.hashId == '-1') {
                return;
              }
              $('#editorViewTab a[href="#stateEditor"]').tab('show');
              stateData.getData(d.hashId);
            });

        nodeEnter.append("svg:text")
            .attr("dy", function(d) { return d.y0; })
            .attr("dx", function(d) { return d.x0; })
            .text(function(d) { return d.name; });

        // Add a "delete node" handler.
        nodeEnter.append("svg:rect")
            .attr("y", function(d) { return d.y0; })
            .attr("x", function(d) { return d.x0; })
            .attr("height", 20)
            .attr("width", 20)
            .attr("opacity", 0)
            .attr("transform", function(d) { return "translate(" + (20) + "," + (-30) + ")"; })
            .attr("stroke-width", "0")
            .on("click", function (d) {
              if (d.hashId == initStateId) {
                return;
              }
              scope.$parent.$parent.deleteState(d.hashId);
            });

        nodeEnter.append("svg:text")
            .attr("dy", function(d) { return d.y0 - 20; })
            .attr("dx", function(d) { return d.x0 + 20; })
            .text(function(d) {
              if (d.hashId == initStateId || d.hashId == '-1') {
                return;
              }
              return 'x';
            });
      });
    }
  }
});

/**
 * Injects dependencies in a way that is preserved by minification.
 */
EditorGraph.$inject = ['$scope', '$http', 'explorationData'];