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
import ChatListPage from '../pages/chat/ChatListPage';
import { get } from '../lib/api';
import { useTheme } from '../context/ThemeContext';

const Tab = createBottomTabNavigator();

export default function MainTabNavigator() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { colors } = useTheme();

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
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const isOrganizer = user?.role === 'ORGANIZER';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          height: 60,
          paddingBottom: 6,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Home: 'home',
            Discover: 'compass',
            Record: 'map',
            Create: 'plus-square',
            Events: 'bell',
            Messages: 'message-circle',
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
      <Tab.Screen name="Messages" component={ChatListPage} />

      <Tab.Screen name="Profile">
        {(props) => <ProfilePage {...props} user={user} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
