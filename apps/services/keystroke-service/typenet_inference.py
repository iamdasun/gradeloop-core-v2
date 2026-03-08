"""
TypeNet Inference Module
Loads the pre-trained TypeNet model and provides embedding generation for authentication
"""

import torch
import torch.nn as nn
import numpy as np
from typing import Dict, List
import pickle


class TypeNet(nn.Module):
    """
    TypeNet Architecture - Same as training script
    Must match the architecture used during training
    """

    def __init__(
        self,
        input_size=5,
        hidden_size=128,
        output_size=128,
        dropout_rate=0.5,
        sequence_length=70,
    ):
        super(TypeNet, self).__init__()

        self.sequence_length = sequence_length

        # LSTM Layer 1
        self.lstm1 = nn.LSTM(input_size, hidden_size, batch_first=True)
        self.bn1 = nn.BatchNorm1d(hidden_size)  # Normalize across hidden dimension
        self.dropout1 = nn.Dropout(dropout_rate)

        # LSTM Layer 2
        self.lstm2 = nn.LSTM(hidden_size, hidden_size, batch_first=True)
        self.bn2 = nn.BatchNorm1d(hidden_size)  # Normalize across hidden dimension
        self.dropout2 = nn.Dropout(dropout_rate)

        # Output Embedding Layer
        self.fc = nn.Linear(hidden_size, output_size)

    def forward(self, x):
        """
        Forward pass for a single sequence
        Args:
            x: (batch_size, seq_len, 5) - [HL, IL, PL, RL, KeyCode]
        Returns:
            embedding: (batch_size, 128)
        """
        # LSTM 1
        out, _ = self.lstm1(x)
        # out shape: (batch_size, seq_len, hidden_size)
        # Permute to (batch_size, hidden_size, seq_len) for BatchNorm1d
        out = out.permute(0, 2, 1)
        out = self.bn1(out)
        out = out.permute(0, 2, 1)  # Back to (batch_size, seq_len, hidden_size)
        out = self.dropout1(out)

        # LSTM 2
        out, _ = self.lstm2(out)
        out = out.permute(0, 2, 1)
        out = self.bn2(out)
        out = out.permute(0, 2, 1)
        out = self.dropout2(out)

        # Take last timestep
        last_timestep = out[:, -1, :]

        # Generate embedding
        embedding = self.fc(last_timestep)
        return embedding


class TypeNetAuthenticator:
    """
    Authentication system using pre-trained TypeNet model
    Handles enrollment, verification, and identification
    """

    def __init__(self, model_path: str = None, device: str = "cpu"):
        """
        Initialize TypeNet authenticator

        Args:
            model_path: Path to the trained TypeNet model (.pth file)
            device: 'cpu' or 'cuda'
        """
        self.device = torch.device(device if torch.cuda.is_available() else "cpu")

        # Initialize TypeNet model
        self.model = TypeNet(
            input_size=5, hidden_size=128, output_size=128, dropout_rate=0.5
        ).to(self.device)

        # Load pre-trained weights if provided
        if model_path:
            self.load_model(model_path)

        self.user_templates = {}  # Store enrolled user templates
        print(f"✅ TypeNet initialized on device: {self.device}")

    def load_model(self, model_path: str):
        """Load pre-trained TypeNet weights"""
        try:
            state_dict = torch.load(model_path, map_location=self.device)
            self.model.load_state_dict(state_dict)
            self.model.eval()
            print(f"✅ TypeNet model loaded from {model_path}")
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            raise

    def get_embedding(self, keystroke_sequence: np.ndarray) -> np.ndarray:
        """
        Generate embedding for a keystroke sequence

        Args:
            keystroke_sequence: (seq_len, 5) array - [HL, IL, PL, RL, KeyCode]
                                Must be exactly 70 keystrokes (as per training)

        Returns:
            embedding: (128,) numpy array
        """
        self.model.eval()

        with torch.no_grad():
            # Convert to tensor and add batch dimension
            x = torch.FloatTensor(keystroke_sequence).unsqueeze(0).to(self.device)

            # Get embedding
            embedding = self.model(x)

            return embedding.cpu().numpy()[0]

    def enroll_user(self, user_id: str, keystroke_sequences: List[np.ndarray]) -> Dict:
        """
        Enroll a user by creating a biometric template

        Args:
            user_id: Unique user identifier
            keystroke_sequences: List of sequences, each (70, 5)

        Returns:
            enrollment_result: Dict with enrollment status
        """
        if len(keystroke_sequences) < 3:
            return {"success": False, "message": "Need at least 3 enrollment samples"}

        embeddings = []
        for sequence in keystroke_sequences:
            # Validate shape
            if sequence.shape[0] != 70 or sequence.shape[1] != 5:
                print(
                    f"⚠️ Warning: Sequence has shape {sequence.shape}, expected (70, 5)"
                )
                continue

            embedding = self.get_embedding(sequence)
            embeddings.append(embedding)

        if len(embeddings) < 3:
            return {
                "success": False,
                "message": "Not enough valid sequences for enrollment",
            }

        # Create template as mean of embeddings
        template = np.mean(embeddings, axis=0)
        template_std = np.std(embeddings, axis=0)

        self.user_templates[user_id] = {
            "template": template,
            "std": template_std,
            "sample_count": len(embeddings),
        }

        return {
            "success": True,
            "user_id": user_id,
            "samples_enrolled": len(embeddings),
            "message": f"User {user_id} enrolled successfully with TypeNet",
        }

    def verify_user(
        self, user_id: str, keystroke_sequence: np.ndarray, threshold: float = 0.7
    ) -> Dict:
        """
        Verify if keystroke pattern matches enrolled user

        Args:
            user_id: User to verify
            keystroke_sequence: (70, 5) sequence to verify
            threshold: Similarity threshold (0-1)

        Returns:
            verification_result: Dict with verification status
        """
        if user_id not in self.user_templates:
            return {
                "success": False,
                "authenticated": False,
                "message": "User not enrolled",
                "risk_score": 1.0,
            }

        # Validate input shape
        if keystroke_sequence.shape[0] != 70 or keystroke_sequence.shape[1] != 5:
            return {
                "success": False,
                "authenticated": False,
                "message": f"Invalid sequence shape: {keystroke_sequence.shape}, expected (70, 5)",
            }

        # Get embedding
        current_embedding = self.get_embedding(keystroke_sequence)

        # Compare with template
        template = self.user_templates[user_id]["template"]
        similarity = self._cosine_similarity(current_embedding, template)
        risk_score = 1 - similarity
        authenticated = similarity >= threshold

        return {
            "success": True,
            "authenticated": authenticated,
            "user_id": user_id,
            "similarity": float(similarity),
            "risk_score": float(risk_score),
            "threshold": threshold,
            "message": "Authenticated" if authenticated else "Authentication failed",
        }

    def identify_user(self, keystroke_sequence: np.ndarray, top_k: int = 3) -> Dict:
        """
        Identify user by comparing against all enrolled users

        Args:
            keystroke_sequence: (70, 5) sequence
            top_k: Number of top matches to return

        Returns:
            identification_result: Dict with top matches
        """
        if not self.user_templates:
            return {"success": False, "message": "No users enrolled", "matches": []}

        # Validate shape
        if keystroke_sequence.shape[0] != 70 or keystroke_sequence.shape[1] != 5:
            return {
                "success": False,
                "message": f"Invalid sequence shape: {keystroke_sequence.shape}",
            }

        # Get embedding
        current_embedding = self.get_embedding(keystroke_sequence)

        # Compare against all users
        similarities = []
        for user_id, user_data in self.user_templates.items():
            template = user_data["template"]
            similarity = self._cosine_similarity(current_embedding, template)

            similarities.append(
                {
                    "userId": user_id,
                    "similarity": float(similarity),
                    "confidence": float(similarity * 100),
                }
            )

        # Sort by similarity
        similarities.sort(key=lambda x: x["similarity"], reverse=True)
        top_matches = similarities[:top_k]

        # Add rank
        for i, match in enumerate(top_matches):
            match["rank"] = i + 1

        best_match = top_matches[0] if top_matches else None

        # Determine confidence level
        if best_match:
            sim = best_match["similarity"]
            if sim >= 0.8:
                confidence_level = "HIGH"
            elif sim >= 0.6:
                confidence_level = "MEDIUM"
            else:
                confidence_level = "LOW"
        else:
            confidence_level = "UNKNOWN"

        return {
            "success": True,
            "matches": top_matches,
            "best_match": best_match,
            "confidence_level": confidence_level,
            "total_enrolled_users": len(self.user_templates),
            "message": f"Identified with {confidence_level} confidence",
        }

    def continuous_authentication(
        self, user_id: str, sequences: List[np.ndarray], threshold: float = 0.7
    ) -> Dict:
        """
        Continuous authentication across multiple recent sequences
        Implements stress-robust multi-phase verification

        Args:
            user_id: User to verify
            sequences: List of recent keystroke sequences (each 70x5)
            threshold: Similarity threshold (default 0.7)

        Returns:
            Dict with continuous authentication status and metrics
        """
        if user_id not in self.user_templates:
            return {"status": "ERROR", "success": False, "message": "User not enrolled"}

        if not sequences:
            return {
                "status": "ERROR",
                "success": False,
                "message": "No sequences provided",
            }

        # Verify each sequence
        risk_scores = []
        similarity_scores = []

        for sequence in sequences:
            # Validate shape
            if sequence.shape[0] != 70 or sequence.shape[1] != 5:
                continue  # Skip invalid sequences

            # Get verification result
            result = self.verify_user(user_id, sequence, threshold)
            if result["success"]:
                risk_scores.append(result["risk_score"])
                similarity_scores.append(result["similarity"])

        if not risk_scores:
            return {
                "status": "ERROR",
                "success": False,
                "message": "No valid sequences processed",
            }

        # Compute aggregate metrics
        avg_risk = float(np.mean(risk_scores))
        avg_similarity = float(np.mean(similarity_scores))
        max_risk = float(np.max(risk_scores))
        min_similarity = float(np.min(similarity_scores))

        # Determine status based on average risk
        if avg_risk < 0.3:  # Low risk
            status = "AUTHENTICATED"
            authenticated = True
        elif avg_risk < 0.6:  # Medium risk
            status = "SUSPICIOUS"
            authenticated = False
        else:  # High risk
            status = "REJECTED"
            authenticated = False

        # Additional check: if any single check is very high risk, flag as suspicious
        if max_risk > 0.7:
            status = "SUSPICIOUS" if status == "AUTHENTICATED" else status
            authenticated = False

        return {
            "status": status,
            "success": True,
            "authenticated": authenticated,
            "average_risk_score": avg_risk,
            "average_similarity": avg_similarity,
            "max_risk_score": max_risk,
            "min_similarity": min_similarity,
            "verification_count": len(risk_scores),
            "individual_scores": [float(r) for r in risk_scores],
            "threshold": threshold,
            "message": f"Continuous authentication: {status}",
        }

    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors"""
        dot_product = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return dot_product / (norm_a * norm_b)

    def save_templates(self, templates_path: str):
        """Save user templates to disk"""
        with open(templates_path, "wb") as f:
            pickle.dump(self.user_templates, f)
        print(f"✅ User templates saved to {templates_path}")

    def load_templates(self, templates_path: str):
        """Load user templates from disk"""
        with open(templates_path, "rb") as f:
            self.user_templates = pickle.load(f)
        print(f"✅ Loaded {len(self.user_templates)} user templates")


# Example usage
if __name__ == "__main__":
    # Initialize with pre-trained model
    auth = TypeNetAuthenticator(
        model_path="models/typenet_pretrained.pth", device="cpu"
    )

    # Example: Enroll a user with 5 sequences
    user_id = "student_001"
    enrollment_sequences = [
        np.random.randn(70, 5) for _ in range(5)  # Replace with real data
    ]

    result = auth.enroll_user(user_id, enrollment_sequences)
    print("\n📝 Enrollment:", result)

    # Example: Verify user
    test_sequence = np.random.randn(70, 5)  # Replace with real data
    verification = auth.verify_user(user_id, test_sequence, threshold=0.7)
    print("\n🔐 Verification:", verification)

    # Example: Identify user
    identification = auth.identify_user(test_sequence, top_k=3)
    print("\n🔍 Identification:", identification)

    # Save templates
    auth.save_templates("models/user_templates.pkl")
