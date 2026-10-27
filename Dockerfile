# Use lightweight official Python runtime
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Set environment variables for production
ENV PYTHONUNBUFFERED=1 \
    PORT=8080

# Copy all application files
COPY . /app

# Remove local Windows binary if copied
RUN rm -f /app/cloudflared.exe

# Expose default port (Render will override via $PORT automatically)
EXPOSE 8080

# Command to run the application server
CMD ["python", "server.py"]
