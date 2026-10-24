FROM eclipse-temurin:11-jre
ARG JAR_FILE=*.jar
COPY target/${JAR_FILE} order.jar
EXPOSE 8084
ENTRYPOINT ["java", "-jar", "order.jar"]
