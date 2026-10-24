FROM eclipse-temurin:11-jre
ARG JAR_FILE=*.jar
COPY target/${JAR_FILE} restaurant.jar
EXPOSE 8083
ENTRYPOINT ["java", "-jar", "restaurant.jar"]
