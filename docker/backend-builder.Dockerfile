# syntax=docker/dockerfile:1.6
# Build toàn bộ reactor Maven MỘT lần; 7 image service chỉ copy jar từ đây
# (docker-compose.yml: additional_contexts builder=service:backend-builder).
# Build trong container nên không đụng target/ trên host (không mvn clean).
FROM maven:3.8.8-eclipse-temurin-11
ENV MAVEN_OPTS="-Xmx1g"
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -q -Dmaven.test.skip=true package
