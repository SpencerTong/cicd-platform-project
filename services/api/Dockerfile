# =============================================================================
# Stage 1: Builder
# -----------------------------------------------------------------------------
# Uses the official Maven image with Java 21 to compile and package the app.
# Alpine is the lightweight Linux variant — it keeps this stage small even
# though we discard it entirely after building.
# =============================================================================
FROM maven:3.9-eclipse-temurin-21-alpine AS builder

# Set the working directory inside the build container.
WORKDIR /app

# Copy the Maven project descriptor BEFORE the source code.
# Docker builds images in layers. By copying pom.xml separately, the
# dependency-download layer is cached and only re-runs when pom.xml changes —
# not on every source code change. This makes rebuilds much faster.
COPY pom.xml .

# Download all declared dependencies into the local Maven cache.
# --batch-mode suppresses interactive prompts (required in CI/Docker contexts).
RUN mvn dependency:go-offline --batch-mode

# Now copy the source code and build the fat JAR.
# -DskipTests: tests are run by the CI pipeline (Phase 2), not during the
# Docker build. Running them here would slow every image build unnecessarily.
COPY src/ src/
RUN mvn package -DskipTests --batch-mode

# =============================================================================
# Stage 2: Runtime
# -----------------------------------------------------------------------------
# Uses a slim JRE-only image. A JRE can run Java programs but cannot compile
# them — Maven and the Java SDK are not present. This is all we need.
#
# eclipse-temurin is the official OpenJDK distribution maintained by the
# Eclipse Adoptium project. It's the recommended base for production Java images.
# =============================================================================
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Copy ONLY the compiled JAR from Stage 1. Everything else — Maven, the SDK,
# source code, build caches — is left behind and never enters this image.
# Result: ~200MB final image instead of ~700MB.
# Note: the JAR name is derived from artifactId + version in pom.xml.
# A production Dockerfile might rename it to remove the version string,
# but for this project keeping it explicit is clearer for learning.
COPY --from=builder /app/target/api-0.0.1-SNAPSHOT.jar app.jar

# Document that the app listens on port 8080.
# EXPOSE is metadata only — it doesn't open the port. The actual port mapping
# happens at runtime with -p (docker run) or in docker-compose.yml.
EXPOSE 8080

# Start the Spring Boot application when the container runs.
# Using the exec form (JSON array) so the JVM receives OS signals directly —
# important for graceful shutdown when Kubernetes stops the container.
CMD ["java", "-jar", "app.jar"]
