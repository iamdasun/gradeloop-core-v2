"""
Feature extraction for keystroke dynamics
Extracts statistical features from raw keystroke events for authentication
"""

import numpy as np
from typing import List, Dict
from collections import defaultdict


class KeystrokeFeatureExtractor:
    """
    Extracts behavioral biometric features from keystroke sequences
    Based on research: dwell time, flight time, typing speed, error patterns
    """

    def __init__(self, window_size: int = 50):
        """
        Args:
            window_size: Number of keystrokes to consider for feature extraction
        """
        self.window_size = window_size

    def extract_features(self, keystroke_events: List[Dict]) -> np.ndarray:
        """
        Extract feature vector from keystroke events

        Returns a fixed-size feature vector that can be used for ML models
        """
        if len(keystroke_events) < 5:  # Minimum data required
            return None

        features = []

        # 1. Dwell time features
        dwell_times = [e["dwellTime"] for e in keystroke_events if e["dwellTime"] > 0]
        if dwell_times:
            features.extend(
                [
                    np.mean(dwell_times),
                    np.std(dwell_times),
                    np.median(dwell_times),
                    np.percentile(dwell_times, 25),
                    np.percentile(dwell_times, 75),
                ]
            )
        else:
            features.extend([0, 0, 0, 0, 0])

        # 2. Flight time features
        flight_times = [
            e["flightTime"] for e in keystroke_events if e["flightTime"] > 0
        ]
        if flight_times:
            features.extend(
                [
                    np.mean(flight_times),
                    np.std(flight_times),
                    np.median(flight_times),
                    np.percentile(flight_times, 25),
                    np.percentile(flight_times, 75),
                ]
            )
        else:
            features.extend([0, 0, 0, 0, 0])

        # 3. Typing speed (characters per second)
        if len(keystroke_events) > 1:
            duration = (
                keystroke_events[-1]["timestamp"] - keystroke_events[0]["timestamp"]
            ) / 1000.0
            typing_speed = len(keystroke_events) / duration if duration > 0 else 0
            features.append(typing_speed)
        else:
            features.append(0)

        # 4. Error correction patterns (Backspace/Delete frequency)
        error_keys = ["Backspace", "Delete"]
        error_count = sum(1 for e in keystroke_events if e["key"] in error_keys)
        error_rate = error_count / len(keystroke_events)
        features.append(error_rate)

        # 5. Special key usage patterns
        special_keys = ["Shift", "Control", "Alt", "Meta"]
        special_count = sum(1 for e in keystroke_events if e["key"] in special_keys)
        special_rate = special_count / len(keystroke_events)
        features.append(special_rate)

        # 6. Common digraph (two-key) timing
        digraph_features = self._extract_digraph_features(keystroke_events)
        features.extend(digraph_features)

        # 7. Pause patterns (long pauses might indicate thinking)
        pauses = [e["flightTime"] for e in keystroke_events if e["flightTime"] > 500]
        pause_count = len(pauses)
        pause_rate = pause_count / len(keystroke_events)
        features.append(pause_rate)

        return np.array(features, dtype=np.float32)

    def _extract_digraph_features(
        self, events: List[Dict], top_n: int = 5
    ) -> List[float]:
        """
        Extract timing features for common two-key sequences (digraphs)
        Research shows these are highly characteristic of individuals
        """
        digraphs = defaultdict(list)

        for i in range(len(events) - 1):
            key1 = events[i]["key"]
            key2 = events[i + 1]["key"]

            # Only consider letter/number keys
            if len(key1) == 1 and len(key2) == 1:
                digraph = key1 + key2
                timing = events[i + 1]["timestamp"] - events[i]["timestamp"]
                digraphs[digraph].append(timing)

        # Get average timing for top N most common digraphs
        features = []
        common_digraphs = sorted(
            digraphs.items(), key=lambda x: len(x[1]), reverse=True
        )[:top_n]

        for _, timings in common_digraphs:
            features.append(np.mean(timings))

        # Pad if we don't have enough digraphs
        while len(features) < top_n:
            features.append(0)

        return features

    def create_sequence(
        self, keystroke_events: List[Dict], sequence_length: int = 50
    ) -> np.ndarray:
        """
        Create a sequence of features for LSTM input
        Each timestep has basic features: dwell_time, flight_time, key_category

        Args:
            keystroke_events: List of keystroke events
            sequence_length: Length of sequence for LSTM

        Returns:
            np.ndarray of shape (sequence_length, features_per_timestep)
        """
        # Pad or truncate to fixed length
        if len(keystroke_events) > sequence_length:
            events = keystroke_events[-sequence_length:]
        else:
            events = keystroke_events + [keystroke_events[-1]] * (
                sequence_length - len(keystroke_events)
            )

        sequence = []
        for event in events:
            # Simple per-keystroke features for LSTM
            features = [
                event["dwellTime"],
                event["flightTime"],
                self._categorize_key(event["key"]),
            ]
            sequence.append(features)

        return np.array(sequence, dtype=np.float32)

    def create_typenet_sequence(
        self, keystroke_events: List[Dict], sequence_length: int = 70
    ) -> np.ndarray:
        """
        Create a sequence for TypeNet model input
        TypeNet requires 5 features: [HL, IL, PL, RL, KeyCode]

        Features:
        - HL (Hold Latency): Dwell time (key press to release)
        - IL (Inter-key Latency): Flight time (previous release to current press)
        - PL (Press Latency): Time from previous press to current press
        - RL (Release Latency): Time from previous release to current release
        - KeyCode: Numeric key code

        Args:
            keystroke_events: List of keystroke events with timestamp, dwellTime, flightTime, keyCode
            sequence_length: Length of sequence (70 for TypeNet)

        Returns:
            np.ndarray of shape (sequence_length, 5)
        """
        # Pad or truncate to fixed length
        if len(keystroke_events) > sequence_length:
            events = keystroke_events[-sequence_length:]
        else:
            # Pad with last event if not enough data
            if len(keystroke_events) > 0:
                events = keystroke_events + [keystroke_events[-1]] * (
                    sequence_length - len(keystroke_events)
                )
            else:
                # If no events, create dummy data
                dummy_event = {
                    "dwellTime": 0,
                    "flightTime": 0,
                    "keyCode": 0,
                    "timestamp": 0,
                }
                events = [dummy_event] * sequence_length

        sequence = []
        for i, event in enumerate(events):
            # HL: Hold Latency (dwell time)
            hl = float(event.get("dwellTime", 0))

            # IL: Inter-key Latency (flight time)
            il = float(event.get("flightTime", 0))

            # PL: Press Latency (time between key presses)
            if i > 0:
                pl = float(events[i]["timestamp"] - events[i - 1]["timestamp"])
            else:
                pl = 0.0

            # RL: Release Latency (time between key releases)
            if i > 0:
                prev_release = events[i - 1]["timestamp"] + events[i - 1].get(
                    "dwellTime", 0
                )
                curr_release = events[i]["timestamp"] + events[i].get("dwellTime", 0)
                rl = float(curr_release - prev_release)
            else:
                rl = 0.0

            # KeyCode: Numeric representation of the key
            keycode = float(event.get("keyCode", 0))

            # Normalize timing features (convert to seconds for better scale)
            features = [
                hl / 1000.0,  # Convert ms to seconds
                il / 1000.0,
                pl / 1000.0,
                rl / 1000.0,
                keycode / 255.0,  # Normalize keycode to 0-1 range
            ]
            sequence.append(features)

        return np.array(sequence, dtype=np.float32)

    def _categorize_key(self, key: str) -> int:
        """Categorize keys into types (letters, numbers, special, etc.)"""
        if len(key) == 1:
            if key.isalpha():
                return 1  # Letter
            elif key.isdigit():
                return 2  # Number
            else:
                return 3  # Symbol
        else:
            # Special keys
            special_categories = {
                "Backspace": 4,
                "Delete": 5,
                "Enter": 6,
                "Space": 7,
                "Tab": 8,
            }
            return special_categories.get(key, 9)  # 9 = other


# Example usage
if __name__ == "__main__":
    # Sample keystroke data
    sample_data = [
        {
            "userId": "user1",
            "timestamp": 1000,
            "key": "h",
            "dwellTime": 80,
            "flightTime": 0,
        },
        {
            "userId": "user1",
            "timestamp": 1150,
            "key": "e",
            "dwellTime": 75,
            "flightTime": 70,
        },
        {
            "userId": "user1",
            "timestamp": 1300,
            "key": "l",
            "dwellTime": 82,
            "flightTime": 75,
        },
        # ... more events
    ]

    extractor = KeystrokeFeatureExtractor()
    features = extractor.extract_features(sample_data)
    print(f"Extracted {len(features)} features: {features}")

    sequence = extractor.create_sequence(sample_data)
    print(f"Sequence shape for LSTM: {sequence.shape}")
