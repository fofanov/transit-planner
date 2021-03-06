// Copyright 2011: Eugen Sawin, Philip Stahl, Jonas Sternisko
var server = "http://" + window.location.hostname + ":" + window.location.port;

function Path(stop, time) {
  this.dep_stop = stop;
  this.dep_time = time;
  this.stops = new Array();
  this.stops.push(stop);
  this.polylines = new Array();
}
Path.prototype.last = function() {
  return this.stops[this.stops.length-1];
}
Path.prototype.pushLine = function(line) {
  this.polylines.push(line);
}
Path.prototype.addLine = function(vertices, stop_id, primary) {
  if (vertices.length == 0) {
    return;
  }
  var colour = primary ? "#0000FF" : "#00FF00";
  var line = new google.maps.Polyline({
  path: vertices,
  strokeColor: colour, //"#5ad715", "#0000FF",
  strokeOpacity: 0.3,
  strokeWeight: 5});
  line.setMap(map);
  google.maps.event.addListener(line, "mouseover",
        function() { line.setOptions({strokeColor: "#C95723",
                 strokeOpacity: 0.5}); });
  google.maps.event.addListener(line, "mouseout",
        function() { line.setOptions({strokeColor: colour,
                 strokeOpacity: 0.3}); });
  if (!this.polylines[stop_id]) {
    this.polylines[stop_id] = new Array();
  }
  this.polylines[stop_id].push(line);
}
Path.prototype.removeLine = function(stop_id) {
  for (line in this.polylines[stop_id]) {
    this.polylines[stop_id][line].setMap(null);
  }
  this.polylines[stop_id] = new Array();
}
Path.prototype.removeAllLines = function() {
  for (stop in this.polylines) {
    for (line in this.polylines[stop]) {
      this.polylines[stop][line].setMap(null);
    }
    this.polylines[stop] = new Array();
  }
}

function Stop(id, name, lat, lon, cost, penalty) {
  this.id = id;
  this.name = name;
  this.lat = lat;
  this.lon = lon;
  this.cost = cost;
  this.penalty = penalty;
}

function VariableSet() {
  this.google_route = false;
  this.transfer_patterns = true;
}
VariableSet.prototype.set = function(k, v) {
  if (this[k] == undefined) {
    return false;
  }
  if (k == "google_route" || k == "transfer_patterns") {
    if (v != "true" && v != "false") {
      return false;
    }
    this[k] = v == "true" ? true : false;
  }
  return true;
}
VariableSet.prototype.save = function() {
  $.cookie("google_route", this.google_route);
  $.cookie("transfer_patterns", this.transfer_patterns);
}
VariableSet.prototype.load = function() {
  this.google_route = $.cookie("google_route") == "true" ? true : false;
  this.transfer_patterns = $.cookie("transfer_patterns") == "true" ? true : false;
}

function State() {
  this.markers = new Array();
  this.seeds = new Array();
  this.hubs = new Array();
  this.transfers = new Array();
  this.path = null;
  this.last_location = null;
  this.last_time = null;
  this.last_stop = null;
  this.num_markers = 0;
  this.vars = new VariableSet();
}
State.prototype.removeStop = function(index) {
  if (index == 0) {
    this.path.removeAllLines();
    this.path = null;
    for (var i in this.markers) {
      if (this.markers[i]) {
        this.removeMarker(i);
      }
    }
    this.markers = new Array();
    this.num_markers = 0;
  } else {
    this.removeMarker(index);
    //this.markers.splice(index, 1);
  }
}
State.prototype.removeMarker = function(index) {
  var id = this.markers[index].stop.id;
  this.markers[index].setMap(null);
  this.markers[index].info.setMap(null);
  this.markers[index] = null;
  for (var i in this.transfers[id]) {
    this.transfers[id][i].setMap(null);
    this.transfers[id][i].info.setMap(null);
    this.transfers[id][i] = null;
  }
  this.transfers[id] = new Array();
}
State.prototype.removeMarkerType = function(type) {
  if (type == "seed") {
    for (var i in this.seeds) {
      this.seeds[i].setMap(null);
      this.seeds[i].info.setMap(null);
      this.seeds[i] = null;
    }
  } else if (type == "hub") {
    for (var i in this.hubs) {
      this.hubs[i].setMap(null);
      this.hubs[i].info.setMap(null);
      this.hubs[i] = null;
    }
  } else {
    for (var i in this.markers) {
      if (this.markers[i].type == type) {
        this.markers[i].setMap(null);
        this.markers[i].info.setMap(null);
        this.markers[i] = null;
      }
    }
  }
}
State.prototype.addMarker = function(stop, type) {
  var marker = new Marker(stop, this.markers.length, type);
  if (type == "seed") {
    this.seeds.push(marker);
    marker.setIcon(marker.seed_icon);
  } else if (type == "hub") {
    this.hubs.push(marker);
    marker.setIcon(marker.imp_icon);
  } else if (type == "regular") {
    this.markers.push(marker);
    this.transfers[stop.id] = new Array();
    this.num_markers++;
  } else if (type == "transfer") {
    this.transfers[stop.destination].push(marker);
    marker.setIcon(marker.transfer_icon);
  } else if (type == "tp-transfer") {
    this.transfers[stop.destination].push(marker);
    marker.setIcon(marker.tp_transfer_icon);
  } else if (type == "label") {
    this.seeds.push(marker);
    marker.setIcon(marker.label_icon);
  }
  marker.type = type;
}
State.prototype.setMarkerLabels = function(id, labels) {
  for (var m in this.markers) {
    if (this.markers[m] && this.markers[m].id == id) {
      var label_text = "";
      for (var l in labels) {
        if (label_text.length) {
          label_text += " ";
        }
        label_text += ((labels[l][0])/60.0).toFixed(2) + ", "
            + labels[l][1];
      }
      this.markers[m].info.setContent(label_text);
      break;
    }
  }
}
State.prototype.addMarkerLabels = function(id, labels) {
  for (var m in this.markers) {
    if (this.markers[m] && this.markers[m].id == id) {
      var labelText = this.markers[m].info.getContent();
      if (labelText.length) {
        labelText += " IIIIIIIIIII ";
      }
      for (var l in labels) {
        if (labelText.length) {
          labelText += " ";
        }
        labelText += ((labels[l][0])/60.0).toFixed(2) + ", "
          + labels[l][1];
      }
      this.markers[m].info.setContent(labelText);
      break;
    }
  }
}
State.prototype.removeLine = function(stop_id) {
  if (this.path) {
    this.path.removeLine(stop_id);
  }
}

function Requests() {
  this.route = new Array();
}
Requests.prototype.push = function(stop) {
  this.route.push(stop);
}
Requests.prototype.pop = function() {
  var stop = new Stop(this.route[0].id, this.route[0].name,
                      this.route[0].lat, this.route[0].lon,
                      this.route[0].cost, this.route[0].penalty);
  if (this.route.length == 1) {
    this.route = new Array();
  } else {
    this.route = this.route.slice(0, 1);
  }
  return stop;
}

var state = new State();
var requests = new Requests();
var geocoder;
var map;
var markers = new Array();
var paths = new Array();
var infos = new Array();

var label_count = 1;
var marker_call = false;
var path_call = false;
var path_from;
var path_to;
var moved_marker;
var obsolete_marker_id;
var last_move_time = new Date().getTime();
var last_time;
var selected_marker;

var keyActionMap = {'F': activateShell}
var keyboard;
var searching = false;

var move_delay = 300; // ms

$(document).ready(
function() {
  var lat_lon = new google.maps.LatLng(21.3894, -157.981);
  var opts = { zoom: 10,
               center: lat_lon,
	             mapTypeId: google.maps.MapTypeId.TERRAIN };
  map = new google.maps.Map(document.getElementById("map_canvas"), opts);
  google.maps.event.addListener(map, "click",
                                function(event) { mapClicked(event.latLng); });
  geocoder = new google.maps.Geocoder();
  document.onkeydown = handleKeyDown;
  document.onkeyup = handleKeyUp;
  keyboard = new Keyboard(keyActionMap);
  $("#datetime").datetimepicker({dateFormat: "dd.mm.yy",
                                 altFormat: "yymmdd"});
  $("#dialog").dialog({ autoOpen: false,
                        modal: true,
                        resizable: false,
                        flat: true,
                        open: dialogOpen,
                        buttons: { "ok": dialogOk },
                        close: dialogClose });
  updateBounds();
  update();
  activateShell();
  help();
  state.vars.load();
});

function dialogOpen() {
  // $("#datetime").datetimepicker("setDate", +0.1);
  $("#datetime").datetimepicker("setDate", new Date(2012, 4, 1));
}

function dialogOk() {
  state.last_time = document.getElementById("datetime").value;
  document.getElementById("datetime").value = "";
  $(this).dialog("close");
}

function dialogClose() {
  selectStop(state.last_location);
}

function mapClicked(location) {
  state.last_location = location;
  if (!state.path) {
    $("#dialog").dialog("open");
  } else {
    selectStop(location);
    if (state.vars.google_route) {
      findGoogleRoute(state.last_location, location);
    }
  }
}

function writeInfo(text) {
  var info = document.getElementById("shell_info");
  info.textContent = text;  // workaround for Firefox
  info.innerText = text;
}

// dd.mm.yyyy HH:MM -> yyyymmddTHHMMSS
function isoTime(time) {
  return  time.slice(6, 10) + time.slice(3, 5) + time.slice(0, 2)
	+ "T" + time.slice(11, 13) + time.slice(14, 16) + "00";
}

function selectStop(location) {
  $.ajax({url: server + "/select?lat=" + location.lat()
    + "&lon=" + location.lng(),
    dataType: "json",
    success: selectCallback});
}

function selectStopById(id) {
  $.ajax({url: server + "/selectbyid?id=" + id,
          dataType: "json",
          success: selectCallback});
}

function selectCallback(json, status, xhr) {
  if (state.path) {
    requests.push(state.path.last());
  }
  if (json["id"] != "") {
    state.last_stop = new Stop(json["id"], json["name"],
                               json["lat"], json["lon"]);
    if (!state.path) {
      state.path = new Path(state.last_stop, state.last_time);
    } else {
      findRoute(requests.pop(), state.last_time, state.last_stop);
    }
    state.addMarker(state.last_stop, "regular");
  }
}

function findRoute(dep_stop, dep_time, dest_stop) {
  $.ajax({url: server + "/route",
          data: "from=" + dep_stop.id
          + "&to=" + dest_stop.id
          + "&at=" + isoTime(dep_time)
          + "&tp=" + (state.vars.transfer_patterns ? "1" : "0"),
    dataType: "json",
    success: findRouteCallback});
  if (state.vars.transfer_patterns) {
    $.ajax({url: server + "/route",
            data: "from=" + dep_stop.id
            + "&to=" + dest_stop.id
            + "&at=" + isoTime(dep_time)
            + "&tp=0",
            dataType: "json",
            success: findRouteCallback});
  }
}

function findRouteCallback(json, status, xhr) {
  var stop_id = json["id"];
  var labels = json["labels"];
  var stops = json["stops"];
  var tp = !!json["tp"];
  var primary = tp == state.vars.transfer_patterns;
  if (primary) {
    state.setMarkerLabels(stop_id, labels);
  } else {
    state.addMarkerLabels(stop_id, labels);
  }
  var last_label = stops[0] ? stops[0]["label"] : -1;
  var vertices = new Array();
  var last_stop = new Stop(stops[0]["id"],
                           stops[0]["name"],
                           stops[0]["lat"],
                           stops[0]["lon"],
                           stops[0]["cost"],
                           stops[0]["penalty"]);
  for (var i in stops) {
    var label = stops[i]["label"];
    var stop = new Stop(stops[i]["id"],
                        stops[i]["name"],
                        stops[i]["lat"],
                        stops[i]["lon"],
                        stops[i]["cost"],
                        stops[i]["penalty"]);
    if (last_label != label) {
      state.path.addLine(vertices, stop_id, primary);
      vertices = new Array();
      last_stop = stop;
    }
    var v = new google.maps.LatLng(stop.lat, stop.lon);
    // v.id = stop.id;
    vertices.push(v);
    if (last_stop.penalty > stop.penalty || tp) {
      stop.destination = stop_id;
      state.addMarker(stop, (tp ? "tp-" : "") + "transfer");
      last_stop = stop;
    }
    last_label = label;
  }
  state.path.addLine(vertices, stop_id, primary);
}

function test(iter, time, time2, seed) {
  if (iter == undefined) {
    help("test");
    return;
  }
  writeInfo("testing...");
  $.ajax({url: server + "/test",
          data: "num=" + iter
          + (seed ? "&seed=" + seed : "")
          + (time ? "&time=" + isoTime(time + " " + time2) : "")
          + "&tp=" + (state.vars.transfer_patterns ? "1" : "0"),
          dataType: "json",
          success: testCallback});
}

function testCallback(json, status, xhr) {
  writeInfo(json);
}

function generatescenario() {
  var params = Array.prototype.slice.apply(arguments);
  if (params == undefined || params == "") {
    help("generatescenario");
    return;
  }
  if (params.length % 2 != 0) {
    help("generatescenario");
    return;
  }
  var dataStr = "numparams=" + (params.length / 2);
  for (i = 1; i < params.length; i+=2) {
    var percent = params[i-1];
    var mean = params[i];
    var id = (i-1) / 2;
    dataStr += "&percent" + id + "=" + percent +
               "&mean" + id + "=" + mean*60.0;
  }
  writeInfo("generating scenario...");
  $.ajax({url: server + "/generatescenario",
          data: dataStr,
          dataType: "json",
          success: generatescenarioCallback});
}

function generatescenarioCallback(json, status, xhr) {
  writeInfo(json);
}

function label() {
  var params = Array.prototype.slice.apply(arguments);
  if (params == undefined || params == "") {
    help("label");
    return;
  }
  var dataStr = "count=" + params.length;
  for (var i in params) {
    dataStr += "&stopid" + i + "=" + params[i];
  }
  writeInfo("label stops...");
  $.ajax({url: server + "/label",
          data: dataStr,
          dataType: "json",
          success:labelCallback});
}

function labelCallback(json, status, xhr) {
  for (var i in json["labels"]) {
    var entry = json["labels"][i];
    var stop = new Stop(entry["id"], entry["name"], entry["lat"], entry["lon"]);
    state.addMarker(stop, "label");
  }
}

function updateBounds() {
  $.ajax({ url: server + "/geoinfo?",
           dataType: "json",
           success: updateBoundsCallback });
}

function updateBoundsCallback(json, status, xhr) {
  var min = new google.maps.LatLng(json["min_lat"], json["min_lon"]);
  var max = new google.maps.LatLng(json["max_lat"], json["max_lon"]);
  var center = new google.maps.LatLng(min.lat() + (max.lat() - min.lat()) / 2.0,
                                      min.lng() + (max.lng() - min.lng()) / 2.0);
  var bounds = new google.maps.LatLngBounds();
  bounds.extend(min);
  bounds.extend(max);
  map.panTo(center);
  map.fitBounds(bounds);
}

function update() {
  //requestAnimFrame(update);
  keyboard.handle();
}

function help(command) {
  if (command) {
    if (shell_commands[command]) {
      writeInfo(shell_commands[command]);
    } else {
      writeInfo("unknown command " + command);
    }
  } else {
    var info = "available commands:\n";
    for (var k in shell_commands) {
      info += k + " ";
    }
    writeInfo(info);
  }
}

function listnetworks() {
  $.ajax({url: server + "/listnetworks?",
          dataType: "json",
          success: listnetworksCallback});
}

function listnetworksCallback(json, status, xhr) {
  writeInfo(json);
}

function loadnetwork(name) {
  if (name == undefined) {
    help("loadnetwork");
    return;
  }
  writeInfo("loading network...");
  $.ajax({url: server + "/loadnetwork?path=" + name,
          dataType: "json",
          success: loadnetworkCallback});
}

function loadnetworkCallback(json, status, xhr) {
  writeInfo(json);
}

function plotseeds(numSeeds) {
  if (numSeeds == undefined) {
    help("plotseeds");
    return;
  }
  $.ajax({url: server + "/plotseeds",
          data: "seeds=" + numSeeds,
          dataType: "json",
          success: plotseedsCallback});
}

function plotseedsCallback(json, status, xhr) {
  for (var i in json["seeds"]) {
    var j = json["seeds"][i];
    var stop = new Stop(j["id"], j["name"], j["lat"], j["lon"]);
    state.addMarker(stop, "seed");
  }
  writeInfo("seeds plotted");
}

function clearseeds() {
  state.removeMarkerType("seed");
}

function showhubs() {
  $.ajax({url: server + "/listhubs",
          data: "dummy=0",
    dataType: "json",
            success: showhubsCallback});
}

function showhubsCallback(json, status, xhr) {
  for (var i in json["hubs"]) {
    var j = json["hubs"][i];
    var stop = new Stop(j["id"], j["name"], j["lat"], j["lon"]);
    state.addMarker(stop, "hub");
  }
  writeInfo("showing hub stations");
}

function hidehubs() {
  state.removeMarkerType("hub");
}

function set(k, v) {
  if (!k) {
    writeInfo("available variables:\n" + JSON.stringify(state.vars));
    return;
  }
  if (state.vars.set(k, v)) {
    writeInfo(k + " set to " + v);
  } else {
    writeInfo("variable " + k + " is unknown or wrong value type provided");
  }
  state.vars.save();
}

function get(k) {
  if (!k) {
    writeInfo("available variables:\n" + JSON.stringify(state.vars));
    return;
  }
  if (state.vars[k] != undefined) {
    writeInfo(k + " is set to " + state.vars[k]);
  } else {
    writeInfo("variable " + k + " is unknown");
  }
}

function route(depId, time1, time2, destId) {
  if (state.path) {
    state.removeStop(0);
  }
  selectStopById(depId);
  state.last_time = time1 + " " + time2;
  window.setTimeout("selectStopById(" + destId + ")", 2000);
}


var shell_commands =
{"help": "help [<command>]\ndisplays command help",
"listnetworks": "listnetworks\nlists all available networks to load",
"loadnetwork": "loadnetwork <network>\nloads <network> if available",
"test": "test <num> [<date> [<seed>]]\nruns <num> tests at given <date> and <seed>",
"plotseeds": "plotseeds <num>\nselects <num> seeds distributed across the map",
"clearseeds": "clearseeds\nclears all seeds from the map",
"showhubs": "showhubs\nshows the hub stops used for the transfer patterns",
"hidehubs": "showhubs\nhides the hub stops used for the transfer patterns",
"get": "get <variable>\nshows the value of given variable",
"set": "set <variable> <value>\nsets a client or server variable",
"route": "route <depId> <dd.mm.yyyy HH:MM> <destId>",
"generatescenario": "generatescenario {<percent> <mean>}+\nLoads a modified "
 + "network with <percent> many trips delayed with <mean> delay",
"label": "label stop1 stop2 ... stopN \nLabels the stops 1...N with a common symbol"
 + "(delete with /clearseeds)"
};

function shell() {
  var com = document.getElementById("command").value;
  if (com[0] == "/") {
    var full = com.substr(1);
    var subs = full.split(" ");
    var name = subs == full ? full : subs[0];
    var args = subs.slice(1); // full.substr(name.length+1);
    if (shell_commands[name]) {
      eval(name + "(\"" + args.join("\", \"") + "\");");
    } else {
      writeInfo("unknown command " + name);
    }
  } else {
	  geocoder.geocode({"address": com,
		                  "region": "US"},
			                function(results, status) {
			                  if (status == google.maps.GeocoderStatus.OK) {
				                  map.setCenter(results[0].geometry.location);
				                  mapClicked(results[0].geometry.location);
			                  }
			               });
  }
  // deactivateLocationSearch();
  return false;
}

function deactivateShell() {
  searching = false;
  var search = document.getElementById("shell");
  search.style.visibility = "hidden";
  input_field = document.getElementById("command");
  input_field.value = "";
}

function activateShell() {
  var search = document.getElementById("shell");
  if (!searching) {
    searching = true;
    search.style.visibility = "visible";
    input_field = document.getElementById("command");
    input_field.focus();
    input_field.value = "";
  }
}

function Marker(stop, index, type) {
  var lat_lon = new google.maps.LatLng(stop.lat, stop.lon);
  var title =  stop.name + " @ " + stop.lat + ", " + stop.lon;
  var label = state.num_markers > 0 || type != "regular" ? " " : "S";
  var icon = new google.maps.MarkerImage("http://www.googlemapsmarkers.com/v1/"
           + label + "/222222/FFFFFF/222222/");
  var imp_icon = new google.maps.MarkerImage("http://www.googlemapsmarkers.com/v1/"
          + label + "/C95723/FFFFFF/C95723/");
  var seed_icon = new google.maps.MarkerImage("http://www.googlemapsmarkers.com/v1/"
           + label + "/E05/FFFFFF/E05/");
  var transfer_icon = new google.maps.MarkerImage("http://www.googlemapsmarkers.com/v1/" + label + "/AAAAAA/FFFFFF/00FF00/");
  var tp_transfer_icon = new google.maps.MarkerImage("http://www.googlemapsmarkers.com/v1/" + label + "/AAAAAA/FFFFFF/0000FF/");
  var label_icon = new google.maps.MarkerImage("http://www.googlemapsmarkers.com/v1/009900/");
  var marker = new google.maps.Marker({ position: lat_lon,
                                        map: map,
                                        title: title,
                                        icon: icon,
                                        draggable: true,
                                        zIndex: type == "regular" ? 100 : 10});
  marker.stop = stop;
  marker.index = index;
  marker.id = stop.id;
  marker.icon = icon;
  marker.imp_icon = imp_icon;
  marker.seed_icon = seed_icon;
  marker.transfer_icon = transfer_icon;
  marker.tp_transfer_icon = tp_transfer_icon;
  marker.label_icon = label_icon;
  var opts = { content: "",
               boxStyle: { background: "#222222",
                           border: "0px solid black",
                           textAlign: "center",
                           fontSize: "10pt",
                           color: "#FFFFFF",
                           width: "60px"},
               disableAutoPan: true,
               pixelOffset: new google.maps.Size(-25, 0),
               position: marker.getPosition(),
               closeBoxURL: "",
               isHidden: false,
               //pane: "mapPane",
               enableEventPropagation: true};
  marker.info = new InfoBox(opts);
  marker.info.open(map);
  if (type == "regular") {
    google.maps.event.addListener(marker, "rightclick",
          function() { state.removeStop(index);
                                               state.removeLine(stop.id);
                                             });
    google.maps.event.addListener(marker, "dragend",
          function() { state.removeStop(index);
                                               state.removeLine(stop.id);
                 mapClicked(marker.getPosition()); });
  }
  // google.maps.event.addListener(marker, "mouseover",
// 			  function() { highlight_marker(marker); });
  // google.maps.event.addListener(marker, "mouseout",
  //				  function() { marker.setIcon(icon); });
  return marker;
}

function findGoogleRoute(from, to, time) {
  $.ajax({url: "http://maps.google.com/?saddr=" + from.lat() + "," + from.lng()
          + "&daddr=" + to.lat() + "," + to.lng()
          + "&dirflg=r&output=jsonp",
    dataType: "jsonp",
    success: findGoogleRouteCallback});
}

function findGoogleRouteCallback(json, status, xhr) {
  //writeInfo(json);
}

function round(value, dec) {
  return Math.round(value * Math.pow(10, dec)) / Math.pow(10, dec);
}

function distance(a, b) {
  return Math.sqrt((a.lat()-b.lat())*(a.lat()-b.lat())
       + (a.lng()-b.lng())*(a.lng()-b.lng()));
}

function handleKeyDown(event) {
  keyboard.keyDown(event);
}

function handleKeyUp(event) {
  keyboard.keyUp(event);
}

function Keyboard(actionMap) {
  this.actionMap = actionMap;
  this.pressed = {};
}
Keyboard.prototype.keyDown = function(event) {
  this.pressed[event.keyCode] = true;
}
Keyboard.prototype.keyUp = function(event) {
  update();
  this.pressed[event.keyCode] = false;
}
Keyboard.prototype.handle = function() {
  for (key in this.pressed) {
    if (this.pressed[key]) {
      key = String.fromCharCode(key);
      if (this.actionMap[key]) this.actionMap[key]();
    }
  }
}
