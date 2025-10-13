import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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

const TAB_ICONS = {
  Home: 'home',
  Discover: 'compass',
  Record: 'map',
  Create: 'plus-square',
  Events: 'bell',
  Messages: 'message-circle',
  Profile: 'user',
};

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
          height: 70,
          paddingTop: 8,
          paddingBottom: 12,
          paddingHorizontal: 16,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          shadowColor: '#000',
          shadowOpacity: 0.05,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: -2 },
          elevation: 10,
        },
        tabBarItemStyle: {
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabBarIcon: ({ color, focused, size }) => (
          <View
            style={[
              styles.iconContainer,
              focused && [styles.iconFocused, { borderColor: colors.accent }],
            ]}
          >
            <Icon name={TAB_ICONS[route.name]} size={size - 2} color={color} />
          </View>
        ),
        tabBarLabel: ({ focused, color }) => (
          <Text
            numberOfLines={1}
            style={[
              styles.label,
              focused ? styles.labelFocused : styles.labelInactive,
              { color },
            ]}
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

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    borderRadius: 20,
    width: 38,
    height: 38,
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.25,
    textAlign: 'center',
  },
  labelFocused: {
    fontWeight: '600',
  },
  labelInactive: {
    fontWeight: '500',
  },
  iconFocused: {
    borderWidth: 1.5,
  },
});
