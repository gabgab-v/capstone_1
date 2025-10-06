import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { post } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useUserTrails } from '../hooks/useUserTrails';
import TrailMapPicker from '../components/TrailMapPicker';
import { computeLineStringMeta, formatMetersToKm } from '../utils/geo';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'details', label: 'Details' },
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'trail', label: 'Trail & Location' },
];

function trimOrNull(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toFloatOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toIntOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

export default function CreateEventPage() {
  const [activeTab, setActiveTab] = useState('overview');

  const [title, setTitle] = useState('');
  const [overview, setOverview] = useState('');
  const [itinerary, setItinerary] = useState('');
  const [directions, setDirections] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [durationHrs, setDurationHrs] = useState('');
  const [steps, setSteps] = useState('');
  const [elevationM, setElevationM] = useState('');
  const [price, setPrice] = useState('');
  const [gcashNumber, setGcashNumber] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedTrailId, setSelectedTrailId] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationZoomLevel, setLocationZoomLevel] = useState(null);
  const [locationBounds, setLocationBounds] = useState(null);

  const {
    trails,
    loading: trailsLoading,
    error: trailsError,
    refresh: refreshTrails,
  } = useUserTrails();

  const selectedTrail = useMemo(
    () => trails.find((trail) => trail.id === selectedTrailId) ?? null,
    [trails, selectedTrailId],
  );

  const handleSelectTrail = useCallback((trail) => {
    if (!trail) {
      return;
    }

    setSelectedTrailId(trail.id);

    const meta = computeLineStringMeta(trail.geoJson);
    if (meta?.start && Array.isArray(meta.start)) {
      setSelectedLocation({ lng: meta.start[0], lat: meta.start[1] });
    } else if (meta?.center && Array.isArray(meta.center)) {
      setSelectedLocation({ lng: meta.center[0], lat: meta.center[1] });
    } else {
      setSelectedLocation(null);
    }

    setLocationBounds(meta?.bounds ?? null);
    setLocationZoomLevel(meta?.approxZoom ?? null);

    setLocationName((prev) => {
      if (prev && prev.trim().length > 0) {
        return prev;
      }
      return trimOrNull(trail.label) ?? '';
    });
  }, []);

  useEffect(() => {
    if (!selectedTrailId && trails.length > 0) {
      handleSelectTrail(trails[0]);
    }
  }, [trails, selectedTrailId, handleSelectTrail]);

  const handleLocationSelect = useCallback((coordinate) => {
    setSelectedLocation(coordinate);
  }, []);

  const handleCameraChanged = useCallback((event) => {
    const zoom = event?.properties?.zoom;
    if (Number.isFinite(zoom)) {
      setLocationZoomLevel(zoom);
    }

    const bounds = event?.properties?.bounds;
    if (bounds) {
      const parseCoord = (coord) => {
        if (Array.isArray(coord) && coord.length >= 2) {
          const lng = Number(coord[0]);
          const lat = Number(coord[1]);
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            return [lng, lat];
          }
        }
        if (coord && typeof coord === 'object') {
          const lng = Number(coord.longitude ?? coord.lng);
          const lat = Number(coord.latitude ?? coord.lat);
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            return [lng, lat];
          }
        }
        return null;
      };

      const northEast = parseCoord(bounds.ne ?? bounds.northEast);
      const southWest = parseCoord(bounds.sw ?? bounds.southWest);
      if (northEast && southWest) {
        setLocationBounds({ northEast, southWest });
      }
    }
  }, []);

  const pickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'We need access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      base64: true,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      setSelectedImage({ uri: asset.uri, base64: asset.base64 });
    }
  }, []);

  const handleCreateEvent = useCallback(async () => {
    const trimmedTitle = trimOrNull(title);
    const trimmedGcash = trimOrNull(gcashNumber);
    if (!trimmedTitle) {
      Alert.alert('Missing Information', 'Please add a title for your event.');
      setActiveTab('overview');
      return;
    }
    if (!trimmedGcash) {
      Alert.alert('Missing Information', 'Please provide a GCash number.');
      setActiveTab('details');
      return;
    }

    const priceValue = toIntOrNull(price);
    if (priceValue === null) {
      Alert.alert('Missing Information', 'Please add a valid price.');
      setActiveTab('details');
      return;
    }

    if (!selectedTrail) {
      Alert.alert('Trail Required', 'Select one of your recorded trails for this event.');
      setActiveTab('trail');
      return;
    }

    if (!selectedLocation) {
      Alert.alert('Location Required', 'Tap the map to set the meeting point.');
      setActiveTab('trail');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert('Authentication', 'Sign in again to create an event.');
      return;
    }

    setIsSubmitting(true);

    let imageUrl = null;
    try {
      if (selectedImage?.base64) {
        const fileName = `${Date.now()}-${user.id}.jpg`;
        const { data, error } = await supabase.storage
          .from('Capstone')
          .upload(fileName, decode(selectedImage.base64), {
            contentType: 'image/jpeg',
          });

        if (error) {
          throw error;
        }

        const { data: urlData } = supabase.storage
          .from('Capstone')
          .getPublicUrl(data.path);

        imageUrl = urlData.publicUrl;
      }
    } catch (uploadError) {
      console.error('Image Upload Error:', uploadError);
      Alert.alert('Upload Failed', 'Failed to upload the event image.');
      setIsSubmitting(false);
      return;
    }

    try {
      const eventPayload = {
        title: trimmedTitle,
        overview: trimOrNull(overview),
        itinerary: trimOrNull(itinerary),
        directions: trimOrNull(directions),
        distanceKm: toFloatOrNull(distanceKm),
        durationHrs: toFloatOrNull(durationHrs),
        steps: toIntOrNull(steps),
        elevationM: toFloatOrNull(elevationM),
        price: priceValue,
        gcashNumber: trimmedGcash,
        imageUrl,
        trailId: selectedTrail.id,
        trailGeoJson: selectedTrail.geoJson,
        trailDistanceMeters: selectedTrail.totalDistanceMeters,
        locationName: trimOrNull(locationName),
        locationLatitude: selectedLocation.lat,
        locationLongitude: selectedLocation.lng,
        locationZoomLevel,
        locationBounds,
      };

      const createdEvent = await post('/api/events', eventPayload);
      Alert.alert('Success', 'Event created successfully!');
      console.log('Event created:', createdEvent);
    } catch (err) {
      console.error('Create event error:', err);
      Alert.alert('Error', err.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    title,
    overview,
    itinerary,
    directions,
    distanceKm,
    durationHrs,
    steps,
    elevationM,
    price,
    gcashNumber,
    selectedTrail,
    selectedImage,
    selectedLocation,
    locationName,
    locationBounds,
    locationZoomLevel,
  ]);

  const selectedLocationText =
    selectedLocation &&
    `Lat ${selectedLocation.lat.toFixed(5)}, Lng ${selectedLocation.lng.toFixed(5)}`;

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.headerImageContainer} onPress={pickImage}>
        {selectedImage ? (
          <Image source={{ uri: selectedImage.uri }} style={styles.selectedImage} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Icon name="image" size={80} color="#999999" />
            <TouchableOpacity style={styles.galleryIconContainer}>
              <Icon name="plus-circle" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.titleContainer}>
          <TextInput
            placeholder="Add Title"
            value={title}
            onChangeText={setTitle}
            style={styles.titleInput}
            placeholderTextColor="#FFFFFF"
          />
          <Icon name="edit-2" size={20} color="#FFFFFF" style={styles.titleIcon} />
        </View>
      </TouchableOpacity>

      <View style={styles.tabBar}>
        {TABS.map(({ key, label }) => (
          <TouchableOpacity key={key} onPress={() => setActiveTab(key)}>
            <Text
              style={[
                styles.tabItem,
                activeTab === key && styles.tabItemActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.contentContainer}>
        {activeTab === 'overview' && (
          <View>
            <Text style={styles.infoLabel}>Overview</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              multiline
              value={overview}
              onChangeText={setOverview}
              placeholder="Write an overview of the event..."
            />
          </View>
        )}

        {activeTab === 'details' && (
          <View style={styles.detailsGrid}>
            <View style={styles.infoField}>
              <Text style={styles.infoLabel}>Distance (km)</Text>
              <TextInput
                style={styles.input}
                value={distanceKm}
                onChangeText={setDistanceKm}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>

            <View style={styles.infoField}>
              <Text style={styles.infoLabel}>Estimated Time (hrs)</Text>
              <TextInput
                style={styles.input}
                value={durationHrs}
                onChangeText={setDurationHrs}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>

            <View style={styles.infoField}>
              <Text style={styles.infoLabel}>Steps</Text>
              <TextInput
                style={styles.input}
                value={steps}
                onChangeText={setSteps}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>

            <View style={styles.infoField}>
              <Text style={styles.infoLabel}>Elevation Gain (m)</Text>
              <TextInput
                style={styles.input}
                value={elevationM}
                onChangeText={setElevationM}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>

            <View style={styles.infoField}>
              <Text style={styles.infoLabel}>Price</Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>

            <View style={styles.infoField}>
              <Text style={styles.infoLabel}>GCash Number</Text>
              <TextInput
                style={styles.input}
                value={gcashNumber}
                onChangeText={setGcashNumber}
                placeholder="09XXXXXXXXX"
              />
            </View>
          </View>
        )}

        {activeTab === 'itinerary' && (
          <View>
            <Text style={styles.infoLabel}>Itinerary</Text>
            <TextInput
              style={[styles.input, styles.largeMultilineInput]}
              multiline
              value={itinerary}
              onChangeText={setItinerary}
              placeholder="Day 1: ...&#10;Day 2: ...&#10;etc."
            />
          </View>
        )}

        {activeTab === 'trail' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.infoLabel}>Recorded Trails</Text>
              <TouchableOpacity style={styles.refreshButton} onPress={refreshTrails}>
                <Icon name="refresh-ccw" size={16} color="#1d4ed8" />
                <Text style={styles.refreshLabel}>Reload</Text>
              </TouchableOpacity>
            </View>

            {trailsLoading && (
              <ActivityIndicator color="#2563eb" style={styles.trailLoading} />
            )}

            {!trailsLoading && trailsError && (
              <Text style={styles.errorText}>
                Unable to load trails. Try refreshing.
              </Text>
            )}

            {!trailsLoading && !trailsError && trails.length === 0 && (
              <Text style={styles.helperText}>
                Record a trail first so you can attach it to your event.
              </Text>
            )}

            {!trailsLoading && !trailsError && trails.length > 0 && (
              <View style={styles.trailList}>
                {trails.map((trail) => (
                  <TouchableOpacity
                    key={trail.id}
                    style={[
                      styles.trailCard,
                      selectedTrailId === trail.id && styles.trailCardActive,
                    ]}
                    onPress={() => handleSelectTrail(trail)}
                  >
                    <Text style={styles.trailCardTitle}>
                      {trimOrNull(trail.label) ?? 'Untitled trail'}
                    </Text>
                    <Text style={styles.trailCardMeta}>
                      {formatMetersToKm(trail.totalDistanceMeters)} - {new Date(trail.startedAt).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {selectedTrail && (
              <View style={styles.trailMapSection}>
                <TrailMapPicker
                  trail={selectedTrail}
                  selectedLocation={selectedLocation}
                  onSelectLocation={handleLocationSelect}
                  onCameraChanged={handleCameraChanged}
                  style={styles.trailMap}
                />

                <View style={styles.locationSummary}>
                  <Icon name="map-pin" size={18} color="#ef4444" style={styles.locationIcon} />
                  <Text style={styles.locationSummaryText}>
                    {selectedLocationText ||
                      'Tap the map to drop the meeting point for attendees.'}
                  </Text>
                </View>

                <Text style={styles.helperText}>
                  The selected trail path will be copied into the event preview for your guests.
                </Text>

                <Text style={styles.infoLabel}>Location Name</Text>
                <TextInput
                  style={styles.input}
                  value={locationName}
                  onChangeText={setLocationName}
                  placeholder="Trailhead or meeting spot name"
                />

                <Text style={styles.infoLabel}>Directions / Notes</Text>
                <TextInput
                  style={[styles.input, styles.largeMultilineInput]}
                  multiline
                  value={directions}
                  onChangeText={setDirections}
                  placeholder="Parking details, meetup instructions, terrain notes..."
                />
              </View>
            )}

            {!selectedTrail && trails.length > 0 && (
              <Text style={styles.helperText}>
                Choose a trail above to preview it on the map and drop your meeting point.
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.createButton,
            isSubmitting && styles.buttonDisabled,
          ]}
          onPress={handleCreateEvent}
          disabled={isSubmitting}
        >
          <Text style={styles.createButtonText}>
            {isSubmitting ? 'Saving...' : 'Create Event'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  headerImageContainer: {
    height: 250,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.5,
    width: '100%',
    height: '100%',
  },
  galleryIconContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 15,
    padding: 2,
  },
  titleContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  titleInput: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    minWidth: 200,
  },
  titleIcon: { marginLeft: 8 },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    backgroundColor: '#FFFFFF',
  },
  tabItem: { fontSize: 16, color: '#999999' },
  tabItemActive: {
    fontSize: 16,
    color: '#2E7D32',
    fontWeight: 'bold',
    borderBottomWidth: 2,
    borderBottomColor: '#2E7D32',
    paddingBottom: 4,
  },
  contentContainer: { padding: 20 },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  infoField: { width: '48%', marginBottom: 16 },
  infoLabel: { fontSize: 14, color: '#555555', marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    color: '#333333',
    height: 45,
  },
  multilineInput: {
    height: 120,
    textAlignVertical: 'top',
  },
  largeMultilineInput: {
    height: 150,
    textAlignVertical: 'top',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  refreshLabel: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  helperText: {
    color: '#64748b',
    fontSize: 13,
    marginBottom: 12,
  },
  trailLoading: { marginVertical: 12 },
  trailList: {
    marginBottom: 12,
  },
  trailCard: {
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  trailCardActive: {
    borderColor: '#2563eb',
    backgroundColor: '#dbeafe',
  },
  trailCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  trailCardMeta: {
    fontSize: 12,
    color: '#475569',
    marginTop: 6,
  },
  trailMapSection: {
    marginTop: 8,
  },
  trailMap: {
    marginBottom: 12,
  },
  locationSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationIcon: {
    marginRight: 8,
  },
  locationSummaryText: {
    color: '#1e293b',
    fontSize: 14,
    flexShrink: 1,
  },
  createButton: {
    backgroundColor: '#2E7D32',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 30,
  },
  createButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  buttonDisabled: { opacity: 0.6 },
  selectedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  errorText: {
    color: '#b91c1c',
    marginBottom: 12,
    fontSize: 14,
  },
});
