import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
import os

# --- CONFIGURATION (Based on TypeNet Research) ---
DATA_PATH = '/content/drive/My Drive/processed_aalto_data.npy'
MODEL_SAVE_PATH = '/content/drive/My Drive/typenet_pretrained.pth'

# Hyperparameters from the papers
INPUT_SIZE = 5       # HL, IL, PL, RL, KeyCode [cite: 1384]
HIDDEN_SIZE = 128    # 128 units per LSTM layer 
NUM_LAYERS = 2       # 2 stacked LSTM layers 
OUTPUT_SIZE = 128    # Embedding dimension [cite: 1434]
DROPOUT_RATE = 0.5   # Dropout between LSTM layers 
SEQUENCE_LENGTH = 70 # Optimal sequence length [cite: 1569]
BATCH_SIZE = 512     # Large batch size for stable triplet loss [cite: 1529]
LEARNING_RATE = 0.005 # Learning rate (tuned for Adam) [cite: 1528]
MARGIN = 1.5         # Triplet Loss margin [cite: 1529]
EPOCHS = 100         # Sufficient for convergence

# --- 1. THE DATASET (Triplet Sampling) ---
class KeystrokeTripletDataset(Dataset):
    def __init__(self, npy_path):
        # Load the massive numpy array: (Num_Users, 5_Sequences, 70, 5)
        print(f"Loading data from {npy_path}...")
        self.data = np.load(npy_path, allow_pickle=True)
        self.num_users = self.data.shape[0]
        self.num_sequences = self.data.shape[1]
        print(f"Data Loaded. Users: {self.num_users}, Seq/User: {self.num_sequences}")

    def __len__(self):
        # We define length as number of users, but we sample multiple triplets per user
        return self.num_users * 10 

    def __getitem__(self, index):
        # 1. Select Anchor User (Randomly map index to a user)
        anchor_user_idx = index % self.num_users
        
        # 2. Select Positive Sample (Same User, different sequence)
        # We randomly pick two different sequences from the same user
        seq_indices = np.random.choice(self.num_sequences, size=2, replace=False)
        anchor_seq = self.data[anchor_user_idx, seq_indices[0]]
        positive_seq = self.data[anchor_user_idx, seq_indices[1]]

        # 3. Select Negative Sample (Different User)
        negative_user_idx = np.random.randint(0, self.num_users)
        while negative_user_idx == anchor_user_idx:
            negative_user_idx = np.random.randint(0, self.num_users)
            
        # Pick random sequence from negative user
        negative_seq_idx = np.random.randint(0, self.num_sequences)
        negative_seq = self.data[negative_user_idx, negative_seq_idx]

        # Convert to PyTorch tensors
        return (torch.from_numpy(anchor_seq), 
                torch.from_numpy(positive_seq), 
                torch.from_numpy(negative_seq))

# --- 2. THE MODEL (TypeNet Architecture) ---
class TypeNet(nn.Module):
    def __init__(self):
        super(TypeNet, self).__init__()

        # LSTM Layer 1
        self.lstm1 = nn.LSTM(INPUT_SIZE, HIDDEN_SIZE, batch_first=True)
        self.bn1 = nn.BatchNorm1d(HIDDEN_SIZE)  # Batch Norm across hidden dimension
        self.dropout1 = nn.Dropout(DROPOUT_RATE)

        # LSTM Layer 2
        self.lstm2 = nn.LSTM(HIDDEN_SIZE, HIDDEN_SIZE, batch_first=True)
        self.bn2 = nn.BatchNorm1d(HIDDEN_SIZE)  # Batch Norm across hidden dimension
        self.dropout2 = nn.Dropout(DROPOUT_RATE)

        # Output Embedding Layer (Dense)
        self.fc = nn.Linear(HIDDEN_SIZE, OUTPUT_SIZE) 

    def forward_one(self, x):
        # Input shape: (Batch, Seq_Len, Features)
        
        # Pass through LSTM 1
        out, _ = self.lstm1(x)
        # Batch Norm requires (Batch, Features, Seq_Len), so we permute
        out = out.permute(0, 2, 1) 
        out = self.bn1(out)
        out = out.permute(0, 2, 1) # Permute back
        out = self.dropout1(out)
        
        # Pass through LSTM 2
        out, _ = self.lstm2(out)
        out = out.permute(0, 2, 1)
        out = self.bn2(out)
        out = out.permute(0, 2, 1)
        out = self.dropout2(out)
        
        # Take the output of the LAST timestep for the embedding
        # shape: (Batch, Hidden_Size)
        last_timestep = out[:, -1, :] 
        
        # Final Embedding
        embedding = self.fc(last_timestep)
        return embedding

    def forward(self, anchor, positive, negative):
        # Generate embeddings for all three inputs
        emb_a = self.forward_one(anchor)
        emb_p = self.forward_one(positive)
        emb_n = self.forward_one(negative)
        return emb_a, emb_p, emb_n

# --- 3. THE LOSS FUNCTION (Triplet Loss) ---
class TripletLoss(nn.Module):
    def __init__(self, margin=1.0):
        super(TripletLoss, self).__init__()
        self.margin = margin

    def forward(self, anchor, positive, negative):
        # Distance(Anchor, Positive)
        dist_pos = torch.pow(anchor - positive, 2).sum(dim=1)
        # Distance(Anchor, Negative)
        dist_neg = torch.pow(anchor - negative, 2).sum(dim=1)
        
        # Loss = max(0, dist_pos - dist_neg + margin)
        losses = torch.relu(dist_pos - dist_neg + self.margin)
        return losses.mean()

# --- 4. TRAINING LOOP ---
def train_typenet():
    # Setup Device (GPU is mandatory for this batch size)
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"🚀 Training on device: {device}")

    # Load Data
    dataset = KeystrokeTripletDataset(DATA_PATH)
    dataloader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=2)

    # Initialize Model
    model = TypeNet().to(device)
    criterion = TripletLoss(margin=MARGIN)
    # Adam Optimizer with TypeNet learning rate
    optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE) 

    print("🏋️ Starting Training Loop...")
    model.train()

    for epoch in range(EPOCHS):
        total_loss = 0
        for batch_idx, (anchor, positive, negative) in enumerate(dataloader):
            # Move to GPU
            anchor = anchor.to(device).float()
            positive = positive.to(device).float()
            negative = negative.to(device).float()

            # Forward Pass
            optimizer.zero_grad()
            emb_a, emb_p, emb_n = model(anchor, positive, negative)
            
            # Compute Loss
            loss = criterion(emb_a, emb_p, emb_n)
            
            # Backward Pass
            loss.backward()
            optimizer.step()

            total_loss += loss.item()
            
            if batch_idx % 10 == 0:
                print(f"Epoch {epoch+1} | Batch {batch_idx} | Loss: {loss.item():.4f}")

        avg_loss = total_loss / len(dataloader)
        print(f"✅ Epoch [{epoch+1}/{EPOCHS}] Complete. Avg Loss: {avg_loss:.4f}")
        
        # Save checkpoint every 10 epochs
        if (epoch + 1) % 10 == 0:
            torch.save(model.state_dict(), MODEL_SAVE_PATH)
            print(f"💾 Model saved to {MODEL_SAVE_PATH}")

if __name__ == "__main__":
    train_typenet()