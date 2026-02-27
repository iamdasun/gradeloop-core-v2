FROM golang:alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o email-service ./cmd/api

# Dev stage for hot-reloading
FROM builder AS dev
RUN go install github.com/air-verse/air@latest
CMD ["air"]

FROM alpine:latest

WORKDIR /app

COPY --from=builder /app/email-service .


EXPOSE 8082

CMD ["./email-service"]
