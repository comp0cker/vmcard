// Ideas:
//   - ALERT: If start/end not specific addresses

// BUGS:
// - #1 if over like 3 terms distancematrix API denies request
// - if select specific, then later change it, it wont go back to general
// - "computing" bar doesnt go away after cancel
// - on phone, option for Select best option when autocompleting not visible
// - probably a million more

// ASSUMPTIONS:
// - start/end specific

// LOAD ERRORS
// - Roboto_medium font issue on android

// FEATURES
// - if all results for general search are closed, will notify user and return

import MAPS_API_KEY from './api-key'
import React, { Component } from 'react';
import { Container, Header, Left, Body, Right, Title, Content, 
    Text, Form, Item, Label, Input, Button, Icon, Grid, Col, Root, ActionSheet,
    CheckBox, Toast, ListItem,
    Row} from 'native-base';
import { View, StyleSheet, Animated} from 'react-native'
import { generateAPIUrl, permutator, generatePathUrl, generatePlaceAutocompleteUrl,  extractAddress, concatAddress,
    PLACE_TEXT, STARTING_PLACE_TEXT, ENDING_PLACE_TEXT, generateGeneralSearchURL } from './const';
import { Linking } from 'expo';
import DraggableFlatList from "react-native-draggable-flatlist";
import Autocomplete from 'native-base-autocomplete';
import Geocode from "react-geocode";
import { add, max } from 'react-native-reanimated';
import { withOrientation } from 'react-navigation';
import { Overlay } from 'react-native-elements';
// import './style.css';   

// i get a weird ART error stupid expo
//import ProgressCircleSnail from 'react-native-progress/CircleSnail';
import LOGO from './assets/icon.png';

Geocode.setApiKey(MAPS_API_KEY);

var BUTTONS = ["Apple Maps", "Google Maps", "Waze", "Cancel"];
var CANCEL_INDEX = 3;
var MAX_GENERAL_RESULTS = 3;

const styles = StyleSheet.create({
    autocompleteContainer: {
        backgroundColor: 'snow',
        flex: 1,
        left: 0,
        position: 'absolute',
        right: 0,
        top: 0,
        paddingTop: 10,
        zIndex: 1
      },
    container: {
        flexDirection: 'row',
        height: 100,
        padding: 20,
        justifyContent: "space-between",
    },
    innerContainer: {
        flexDirection: 'row',
        paddingTop: 20,
        paddingBottom: 20,
        justifyContent: "space-evenly",
    },
    title: {
        fontSize: 44,
        fontWeight: "400",
        textAlign: "center"
    },
    subtitle: {
        fontStyle: "italic",
        fontWeight: "300",
        textAlign: "center"
    },
    header: {
        fontSize: 32,
        fontWeight: "400"
    },
    explanationText: {
        textAlign: "center"
    },
    text: {
        textAlign: "center"
    },
    titleBlock: {
        paddingTop: 50,
        paddingBottom: 30,
    },
    input: {
        borderColor: "lightgrey",
        backgroundColor: 'white',
        borderRadius: 20,
        borderStyle: "solid",
        borderWidth: 1,
        margin: 10,
        paddingBottom: 10,
    }
})

const showToast = (description, button) => {
    Toast.show({
        text: description,
        buttonText: button
      })
}

export default class Home extends Component {
    constructor(props) {
        super(props);
        this.state = {
            returnBackHome: false,
            destinations: ["", ""], // initializes three empty places
            allDestinations: ["", ""], // used for distance matrix calc
            lockedPlaces: [true], // needs to be same size as list,
            specific: [true],
            autocomplete: [],
            currentAddress: "",
            currentCoords: "",
            autocompleteOverlayVisible: false, // the overlay for autocomplete modal
            autocompletePos: 0, // the pos of the destination we are editing via autocomplete
            autocompleteFadeValue: new Animated.Value(0),
            computing: false,
            computingProgress: 0
        };
        this.addPlace = this.addPlace.bind(this);
        this.onSubmit = this.onSubmit.bind(this);
        this.endEqualsStart = this.endEqualsStart.bind(this);
        this.endRouteStyling = this.endRouteStyling.bind(this);
        this.lockPlaceStyling = this.lockPlaceStyling.bind(this);
    }

    componentDidMount() {
        this.setCurrentLocation();
    }

    setCurrentLocation() {
        let destinations = this.state.destinations.slice();

        let getPosition = function () {
            var options = {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            };

            return new Promise(function (resolve, reject) {
              navigator.geolocation.getCurrentPosition(resolve, reject, options);
            });
        };
          
        getPosition()
            .then((pos) => {
                this.setState({currentCoords : pos.coords.latitude + "," + pos.coords.longitude});
                Geocode.fromLatLng(pos.coords.latitude, pos.coords.longitude).then(
                    response => {
                        let street = response.results[0].address_components[0].short_name + " " + response.results[0].address_components[1].short_name;
                        let city = response.results[0].address_components[3].short_name;
                        let address = street + " " + city;
                        this.setState({currentAddress : address});
                        destinations[0] = address;
                        this.setState({ destinations });
                        console.log("Current location retrieved successfully and set\nAddress: " + address);
                    },
                    error => {
                        console.log(error);
                    }
                );
            })
            .catch((err) => {
                console.log(err.message);
        });
    }

    // determines startpoint coordinates, then calls getGeneralLocations
    async getGeneralLocations() {
        let start_coords = this.state.currentCoords;
        let start = this.state.destinations[0];
        
        // if user changed start from current location
        // set start_coords to coordinates of the specified start address
        if (start != this.state.currentAddress) {
            let result = await Geocode.fromAddress(start);
            let lat = result["results"][0]["geometry"]["location"]["lat"];
            let long = result["results"][0]["geometry"]["location"]["lng"];
            start_coords = lat + "," + long;
        }

        // console.log("CURRENT ADDRESS\n" + this.state.currentAddress); 

        // iterates through destinations excluding start and end, if destination does not have a number consider it general query
        // url request returns places that match query within ~20 miles (30000 meters) 
        // of either the specific start address
        console.log("STARTING GENERAL SEARCH");
        
        let type = 1;
        let numSearch = this.state.allDestinations.length - 2;
        let matrixDestinations = [start];
        let permDestinations = [];
        let searchTypes = [0]; // type of start is specific

        // if end != start, add end as well
        let end = this.state.allDestinations[this.state.allDestinations.length - 1];
        if (start != end) {
            matrixDestinations.push(end);
        }

        // generate permDests and matrixDests
        for (let i = 1; i < this.state.allDestinations.length - 1; i++) {     
            // if specific set to true
            if (this.state.specific[i]) {                
                // add to matrixDestinations as is
                matrixDestinations.push(this.state.allDestinations[i]);

                // add to permDestinations with type = 0 because its specific
                permDestinations.push([this.state.allDestinations[i], 0]);

                // add to type list
                searchTypes.push(0);
            
                // else general query
            } else {
                let query = this.state.allDestinations[i];
                let url = generateGeneralSearchURL(query, start_coords);
                console.log("QUERY:\n" + query);
                                                

                // url request returns places matching general text search
                let response = await fetch(url);                
                let data = await response.json();
                // console.log(data);

                let results = data["results"];
                console.log(results)

                if (results.length == 0) {
                    showToast("At least one of your general searches returned no results");
                    return;
                }

                let hasHours = false;
                let open = false;

                let locationResults = [];
                let permResults = [];

                // // arbitrarily set to 3 closest to minimize runtime
                for (let k = 0; k < results.length; k++) {
                    if (locationResults.length >= MAX_GENERAL_RESULTS) break;

                    hasHours = results[k].hasOwnProperty('opening_hours');
                    
                    // console.log("name:" + results[k]["name"]);
                    // console.log("hasHOURS:" + hasHours);
                    // console.log("open:" + open);
                    
                    if (hasHours) open = results[k]["opening_hours"]["open_now"];
                    if ((hasHours && open) || !hasHours) { // handles case where store doesnt have hours

                        // the address name now has the name! let's go
                        const location = {
                            "name": results[k]["name"],
                            "address": results[k]["formatted_address"]
                        }

                        // add address to matrix destations                        
                        locationResults.push(location);
                        // add [address, type] to permDests
                        permResults.push([location, type]);
                    }   
                }

                matrixDestinations = matrixDestinations.concat(locationResults);
                permDestinations = permDestinations.concat(permResults);

                if (locationResults.length == 0) {
                    showToast("All locations for search '" + query + "' are closed");
                    return;
                }
                // add to type list
                searchTypes.push(type);
                type++;
            }
        } 

        searchTypes.push(0); // type of end is specific

        console.log("PERM DEST:\n");
        permDestinations.forEach((i) => console.log(i));
        

        return [numSearch, matrixDestinations, permDestinations, searchTypes];
    }

    getDurationFromPath(distanceMatrix, matrixDestinations, path) {
        var duration = 0;        

        // iterating through all the sequential pairs
        for (let i = 0; i < path.length - 1; i++) {
            let firstPoint = matrixDestinations.indexOf(path[i]);
            let secondPoint = matrixDestinations.indexOf(path[i + 1]);            
            let thisDuration = distanceMatrix[firstPoint]["elements"][secondPoint]["duration"]["value"];

            duration += thisDuration;
        }
        return duration
    }

    bruteForceShortestPath(distanceMatrix, numSearch, matrixDestinations, permDestinations, searchTypes) {
        let startingDestination = this.state.allDestinations[0];
        let endingDestination = this.state.allDestinations[this.state.allDestinations.length - 1];        
        
        // perms generated will be for destinations excluding start/end
        let permutations = permutator(permDestinations, numSearch);

        // iterates through the types returned from a permutation,
        // if the types dont match in a locked spot, remove that perm
        permutations = permutations.filter((el) => { 
            let permAdd = el[0];
            let permTypes = el[1];
            
            for (let i = 0; i < permTypes.length; i++) {
                let j = i + 1; // index relative to allDest/searchTypes array
                
                let locked = this.state.lockedPlaces[j];
                let permType = permTypes[i];
                let searchType = searchTypes[j];

                if (locked) {
                    if (permType != searchType) return false;
                    if (permType == 0 && permAdd[i] != this.state.allDestinations[j]) return false; // for specific search
                }
            }
            return true;
        });

        permutations = permutations.map((el) =>  el[0]);

        console.log("LOCKED\n" + this.state.lockedPlaces);

        console.log("PERM AFTER:");
        // permutations.forEach((i) => console.log(i));
        permutations.forEach((i) => console.log(i));

        let minDuration = Number.MAX_SAFE_INTEGER;
        let minPath = [];

        const progressIncr = 1 / permutations.length;
        console.log("PROGRESS INCREMENT")
        console.log(progressIncr)

        permutations.forEach(perm => {
            var path = perm
            path.unshift(startingDestination)
            path.push(endingDestination)

            // extract the addresses from the general locations
            const pathAddresses = extractAddress(path)
            const matrixDestinationsAddresses = extractAddress(matrixDestinations)

            let pathDuration = this.getDurationFromPath(distanceMatrix, matrixDestinationsAddresses, pathAddresses)
            // console.log(path.join(" ==> ") + " total distance: " + pathDuration)

            if (pathDuration < minDuration) {
                minDuration = pathDuration
                minPath = path
            }
            // console.log("PROGRESS: ")
            // console.log(this.state.computingProgress)

            this.setState({computingProgress: this.state.computingProgress += progressIncr})
        })

        // console.log("TOTAL SHORTEST PATH")
        // console.log(minPath.join(" ==> "))
        // console.log(minDuration)

        minPath = concatAddress(minPath)

        let origin = minPath[0]
        let waypoints = minPath.slice(1, minPath.length - 1)
        let destination = minPath[minPath.length - 1]

        console.log("MIN PATH:\n");
        minPath.forEach(i => console.log(i));
        
        console.log("LOCKED\n" + this.state.lockedPlaces);
        console.log("SPECIFIC\n" + this.state.specific);
        
        
        let pathUrl = generatePathUrl(origin, waypoints, destination)
        console.log(pathUrl)

        // if we have waypoints, have Apple Maps use the first one as the destination
        // if no waypoints exist, have Apple Maps use the final destination as the destination
        let appleMapsDestination = waypoints.length ? waypoints[0] : destination
        let applePathUrl = "http://maps.apple.com/?daddr=" + appleMapsDestination.split(" ").join("+")

        this.setState({computing: false})

        ActionSheet.show(
            {
                options: BUTTONS,
                cancelButtonIndex: CANCEL_INDEX,
                title: "Shortest path generated! Choose an app to open in"
            },
            buttonIndex => {
                // console.log(pathUrl)
                if (BUTTONS[buttonIndex] == "Google Maps") {
                    Linking.openURL(pathUrl).catch((err) => console.error('An error occurred', err));
                } else if (BUTTONS[buttonIndex] == "Apple Maps") {
                    console.log(applePathUrl)
                    Linking.openURL(applePathUrl).catch((err) => console.error('An error occurred', err));
                }
                this.setState({ clicked: BUTTONS[buttonIndex] });
            }
        )
    }

    // calls distance matrix API with allDestinations
    getAllDistances() {
        console.log("ALL DESTINATIONS:\n" + this.state.allDestinations);
        
        // find specific addresses for general queries
        this.getGeneralLocations().then((result) => {
            console.log('GETTING GENERAL RESULTS FINISHED');

            if (typeof result == 'undefined') return;

            let numSearch = result[0];
            let matrixDestinations = result[1];
            let permDestinations = result[2];
            let searchTypes = result[3];

            // console.log("\nmatrix destinations:");
            // matrixDestinations.forEach(el => console.log(el));

            // console.log("\nperm destinations:\n");
            // permDestinations.forEach(el => console.log(el));
    
            
            // uses matrixDestinations to return matrix of all distances between all possibilities
            let url = generateAPIUrl(extractAddress(matrixDestinations));
            console.log(url);
            

            fetch(url)
                .then(response => response.json())
                .then(data => {
                    //let allDestinations = data["destination_addresses"]
                    //this.setState({ allDestinations })
                    // here we update the allDestinations in the state
                    // this replaces the generic names we type in with the specific addresses
                    // for example, Washington gets replaced with Washington, USA
                    // if we don't want the user interface to change, we can replace this with
                    // a different variable no problem
                    // console.log(data);
                    if (data["status"] != "OK") {
                        showToast('Too many places, please reduce');
                        console.log(data);
                        return;
                    } else {
                        console.log("\nDISTANCE MATRIX RETURNED STATUS OK\n");
                    }
                    let distanceMatrix = data["rows"];
                    this.bruteForceShortestPath(distanceMatrix, numSearch, matrixDestinations, permDestinations, searchTypes);
                })
                .catch((error) => {
                    console.error('Error:', error);
                });
        });
    }

    autocompleteText(text) {
        let query = text
        let url = generatePlaceAutocompleteUrl(query)
        // console.log(url)

        fetch(url)
            .then(response => response.json())
            .then(data => {
                let autocomplete = data["predictions"].map(pred => pred.description)
                // console.log(autocomplete)
                this.setState({ autocomplete })
            })
            .catch((error) => {
                console.error('Error:', error);
            });
    }

    onPlaceChangeText(text, pos) {
        var destinations = this.state.destinations
        destinations[pos] = text
        this.autocompleteText(text)
        //destinations[pos] = event.nativeEvent.text
        this.setState({ destinations })
    }

    onAutocompleteSelect(sugg, pos, specificFlag) {
        // console.log(sugg)
        // console.log(pos)
        // we want to wipe autocompelete as well
        let autocomplete = []

        var destinations = this.state.destinations
        destinations[pos] = sugg

        if (pos == 0 && this.state.returnBackHome) {
            destinations[destinations.length - 1] = sugg;
        }
        let specific = this.state.specific;
        specific[pos] = specificFlag;

        this.setState({ 
            destinations, 
            autocomplete,
            autocompleteOverlayVisible: false,   // hide the modal
            specific
        })
    }

    addPlace() {
        var destinations = this.state.destinations
        let endDest = destinations[destinations.length - 1]
        destinations.pop()
        destinations.push("")
        destinations.push(endDest)
        this.setState({ destinations })

        // add value for lockPlace tracking/specifcs tracking
        this.setState({lockedPlaces: [...this.state.lockedPlaces, false]});
        this.setState({specific: [...this.state.specific, false]});

        this.setState({
            autocompleteOverlayVisible: true,
            autocompletePos: destinations.length - 2
        })

    }

    editPlace(pos) {
        this.setState({
            autocompleteOverlayVisible: true,
            autocompletePos: pos
        })
    }

    // deletes either empty space or one with name
    deletePlace(pos) {
        var self = this;
        var destinations = this.state.destinations

        if (destinations.length <= 2) {
            showToast("You can't have less than 2 locations!", "Okay")
            return
        }

        destinations.splice(pos, 1)
        this.setState({ destinations })

        // delete for lockPlace tracking
        var lockedPlaces = this.state.lockedPlaces
        lockedPlaces.splice(pos, 1)
        this.setState({ lockedPlaces })

        let specific = this.state.specific;
        specific.splice(pos, 1);
        this.setState({ specific });

    }

    
    onSubmit() {
        if (this.state.destinations.filter(point => point !== "").length < 2) {
            showToast("You must enter at least 2 locations!")
            return;
        }

        console.log("START: " + this.state.destinations[0]);
        console.log("CURRENT ADD: " + this.state.currentAddress);
        
        
        console.log("SPECIFIC:\n" + this.state.specific);
        console.log("LOCKED:\n" + this.state.lockedPlaces);
        
        this.setState({computing: true}) ;
        // filter out all of the empty destinations
        let filteredDestinations = this.state.destinations.filter(destination => destination.length > 0);
        let allDestinations = filteredDestinations;

        this.setState({ allDestinations }, () => this.getAllDistances()); // for distance matrix stuff
    }
    
    // populates final destination with starting destination at index 0 
    endEqualsStart() {    
        let destinations = this.state.destinations.slice();
       
        this.setState(prevState => ({returnBackHome: !prevState.returnBackHome}), () => {
            if (this.state.returnBackHome) {
                destinations[destinations.length - 1] = destinations[0];
            } else {
                destinations[destinations.length - 1] = "";
            }
            this.setState({ destinations }); 
        });
    }

    endRouteStyling(pos) {
        if (pos === this.state.destinations.length - 1 && this.state.returnBackHome) {
            return {
                backgroundColor:'grey',
                disabled: 'true',
                opacity: .5
            }
        } else {
            return "";
        }
        
    }

    // need to lock location in algo for routing
    lockPlace(pos) {
        if (pos === 0) {
            return
        }
        let lockedPlaces = this.state.lockedPlaces;
        lockedPlaces[pos] = !lockedPlaces[pos];
        this.setState({ lockedPlaces });
    }

    lockPlaceStyling(pos) {
        if (this.state.lockedPlaces[pos] === true && pos < this.state.destinations.length - 1 && pos > 0 ) {
            return {
                backgroundColor:'red',
                opacity: .5,
            }
        } else {
            return "";
        }
    }

    _start() {
        this.setState({autocompleteFadeValue: new Animated.Value(0)}, () => {
            Animated.timing(this.state.autocompleteFadeValue, {
                toValue: 1,
                duration: 1000
              }).start();
        })
      };

      renderAutocomplete() {
        return (
          <Overlay
            overlayStyle={{opacity: 1}}
            isVisible={this.state.autocompleteOverlayVisible}
            onBackdropPress={() =>
              this.setState({autocompleteOverlayVisible: false})
            }>
            <ListItem
              onPress={() => {
                console.log(this.state.specific);
                if (this.state.autocompletePos === 0) {
                  showToast('You must make the first destination specific');
                } else if (
                  this.state.autocompletePos ===
                  this.state.destinations.length - 1
                ) {
                  showToast('You must make the last destination specific');
                } else if (
                  this.state.specific.filter(el => !el).length > MAX_GENERAL_RESULTS
                ) {
                  let resetDests = this.state.destinations;
                  resetDests[this.state.autocompletePos] = '';
    
                  this.setState(
                    {
                      autocompleteOverlayVisible: false,
                      autocomplete: [],
                      destinations: resetDests,
                    },
                    () =>
                      showToast(
                        "You can't have more than " +
                          MAX_GENERAL_RESULTS +
                          ' general locations',
                      ),
                  );
                } else {
                  this.onAutocompleteSelect(
                    this.state.destinations[this.state.autocompletePos],
                    this.state.autocompletePos,
                    false,
                  );
                }
              }}>
              <Text>Find best location</Text>
            </ListItem>
    
            <Autocomplete
              autoCorrect={false}
              data={this.state.autocomplete}
              defaultValue={this.state.destinations[this.state.autocompletePos]}
              onChangeText={text =>
                this.onPlaceChangeText(text, this.state.autocompletePos)
              }
              placeholder="Enter place"
              renderItem={sugg => (
                <ListItem
                  onPress={() =>
                    this.onAutocompleteSelect(
                      sugg,
                      this.state.autocompletePos,
                      true,
                    )
                  }>
                  <Text>{sugg}</Text>
                </ListItem>
              )}
            />
          </Overlay>
        );
      }

    render() {
        return (
            <Root>
                <View style={styles.container}>
                    <Container>
                        <Content>
                            <View style={styles.titleBlock}>
                                <Text style={styles.title}>
                                    Cutting Corners
                                </Text>
                                <Text style={styles.subtitle}>
                                    Find the quickest path between all your daily stops
                                </Text>
                            </View>
                            <Form >
                                <View style={styles.innerContainer}>
                                    <CheckBox checked={this.state.returnBackHome} onPress={this.endEqualsStart} />
                                    <Text>End your route at the starting location</Text>
                                </View>

                                {this.renderAutocomplete()}

                                {this.state.destinations.slice(0, -1).map((destinationName, pos) => 
                                
                                    <Grid style={styles.input}>
                                        <Col >
                                            <Item button onPress={() => this.editPlace(pos)} >
                                                <Grid>
                                                    <Row>
                                                        <Label style={{paddingTop: 20, paddingBottom: destinationName === "" ? 0 : 20}} class="active">{pos == 0 ? STARTING_PLACE_TEXT : pos < this.state.destinations.length - 1 ? PLACE_TEXT + " " + (pos) : ENDING_PLACE_TEXT}</Label>
                                                    </Row>
                                                    <Row>
                                                        <Text>{destinationName}</Text>
                                                    </Row>
                                                </Grid>
                                            </Item>
                                        </Col>
                                        {pos ? <Col style={{width: "15%", top: 25}}>
                                            <Button iconLeft transparent style={this.state.lockedPlaces[pos] ? {backgroundColor: 'lightgrey'} : {backgroundColor: 'white'}} onPress={() => this.lockPlace(pos)}>
                                                <Icon type='AntDesign' name='lock'/>
                                            </Button>
                                        </Col>
                                        : <Col style={{width: "15%", top: 25}}></Col>}
                                        <Col style={{width: "15%", top: 25}}>
                                            <Button iconLeft transparent onPress={() => this.deletePlace(pos)}>
                                                <Icon type='AntDesign' name='delete'/>
                                            </Button>
                                        </Col>
                                    </Grid>
                                )}
                                <View style={styles.innerContainer} >
                                    <Button iconLeft onPress={this.addPlace}> 
                                        <Icon name='add' />
                                        <Text>Add a stop</Text>
                                    </Button>
                                </View>
                               
                            </Form>

                            <Form>
                                <Grid style={styles.input}> 
                                        <Col >
                                            <Item button onPress={() => this.state.returnBackHome ? showToast('Cannot edit because you checked "End your route at the starting location".') : this.editPlace(this.state.destinations.length - 1)} >
                                                <Grid>
                                                    <Row>
                                                        <Label style={{paddingTop: 20, paddingBottom: this.state.destinations[this.state.destinations.length - 1] === "" ? 0 : 20}} class="active">{ENDING_PLACE_TEXT}</Label>
                                                    </Row>
                                                    <Row>
                                                        <Text>{this.state.destinations[this.state.destinations.length - 1]}</Text>
                                                    </Row>
                                                </Grid>
                                            </Item>
                                        </Col>
                                        <Col style={{width: "15%", top: 25}}>
                                            <Button iconLeft transparent onPress={() => this.deletePlace(this.state.destinations.length - 1)}>
                                                <Icon type='AntDesign' name='delete'/>
                                            </Button>
                                        </Col>
                                    </Grid>
                            </Form>
                            <View style={styles.innerContainer}>
                                <Button iconLeft  
                                    onPress={this.onSubmit}>
                                    <Icon name='search' />
                                    <Text>Find Shortest Path</Text>
                                </Button>
                            </View>
                            {this.state.computing ? 
                                <View style={styles.innerContainer}>
                                    <Text>Computing...</Text>
                                </View>
                            : null
                            }
                        </Content>
                    </Container>
                </View>
            </Root>
        );
    }
}