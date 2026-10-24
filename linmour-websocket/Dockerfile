FROM eclipse-temurin:11-jre
ARG JAR_FILE=*.jar
COPY target/${JAR_FILE} websocket.jar
EXPOSE 8085
ENTRYPOINT ["java", "-jar", "websocket.jar"]
