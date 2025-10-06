import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Feather';

import HomePage from '../app/HomePage';
import DiscoverPage from '../pages/DiscoverPage';
import CreateEventPage from '../pages/CreateEventPage';
import EventsPage from '../pages/event/EventPage';
import TrailRecorderPage from '../pages/TrailRecorderPage';
import ProfilePage from '../pages/ProfilePage';
import { get } from '../lib/api';

const Tab = createBottomTabNavigator();

export default function MainTabNavigator() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await get('/api/users/me');
        setUser(data);
      } catch (err) {
        console.error('Failed to fetch user:', err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  const isOrganizer = user?.role === 'ORGANIZER';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#2E7D32',
        tabBarInactiveTintColor: '#999999',
        tabBarStyle: { height: 60, paddingBottom: 6 },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Home: 'home',
            Discover: 'compass',
            Record: 'map',
            Create: 'plus-square',
            Events: 'bell',
            Profile: 'user',
          };
          return <Icon name={icons[route.name]} size={size} color={color} />;
        },
        tabBarLabel: ({ focused, color }) => (
          <Text
            style={{
              fontSize: 12,
              fontWeight: focused ? '600' : '400',
              color,
            }}
          >
            {route.name}
          </Text>
        ),
      })}
    >
      <Tab.Screen name="Home">
        {(props) => <HomePage {...props} user={user} />}
      </Tab.Screen>

      <Tab.Screen name="Discover" component={DiscoverPage} />
      <Tab.Screen name="Record" component={TrailRecorderPage} />
      {isOrganizer && <Tab.Screen name="Create" component={CreateEventPage} />}
      <Tab.Screen name="Events" component={EventsPage} />

      <Tab.Screen name="Profile">
        {(props) => <ProfilePage {...props} user={user} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
