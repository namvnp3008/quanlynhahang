FROM eclipse-temurin:11-jre
ARG JAR_FILE=*.jar
COPY target/${JAR_FILE} product.jar
EXPOSE 12802
ENTRYPOINT ["java", "-jar", "product.jar"]
