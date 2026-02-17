FROM golang:latest

# Enviroment variable
WORKDIR /usr/src/some-api

RUN go install github.com/air-verse/air@latest

#Copying files to work directory
COPY go.mod ./
RUN go mod download && go mod verify
COPY . .

# Build the binary for production
RUN CGO_ENABLED=0 GOOS=linux go build -o /usr/local/bin/auth ./cmd/main.go

# Expose default container port 3000
EXPOSE 8081

# Default command: if DEV_MODE=1 use air for dev hot reload, otherwise run the compiled binary
CMD ["sh", "-c", "if [ \"$DEV_MODE\" = \"1\" ]; then air cmd/main.go -b 0.0.0.0; else /usr/local/bin/auth; fi"]
