FROM golang:1.25.6-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main ./cmd/main.go

FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata curl

WORKDIR /root/

COPY --from=builder /app/main .

EXPOSE 8081

CMD ["./main"]
